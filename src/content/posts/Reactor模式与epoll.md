---
title: Epoll解析与Reactor模式
published: 2026-04-30
description: "从 Linux 内核源码层面深度剖析 epoll 的核心数据结构、事件触发链路，并结合 Reactor 事件驱动模型实现高性能 C++ 网络服务器。"
image: ""
tags: [socket, reactor, epoll, linux, kernel]
category: "网络"
series: "c++网络编程"
draft: false 
lang: "zh_CN"
---

# 一、 前置知识铺垫

## 1. 位掩码 (Bitmask)
在 C/C++ 系统编程中，位掩码是状态管理的高效手段。
- **原理**：用一个整数的每一位（Bit）代表一个状态。
- **操作**：
  - **添加模式**：`events = EPOLLIN | EPOLLET;` (同时开启可读与边缘触发)
  - **检查状态**：`if (events & EPOLLIN)` (判断是否可读)
- **优势**：节省内存，且位运算由 CPU 指令级支持，性能极高。

## 2. 什么是 errno？
`errno` 是全局错误码。在非阻塞网络编程中，以下错误不仅不是错误，反而是逻辑的一部分：
- **`EAGAIN` / `EWOULDBLOCK`**：资源暂时不可用。在非阻塞 `read` 中表示“缓冲区读空了”，在 `write` 中表示“发送缓冲区满了”。
- **`EINTR`**：系统调用被信号中断，通常需要捕获并手动重启。
- **`EMFILE`**：进程打开的文件描述符（fd）达到上限。

## 3. 事件驱动 (Event-driven)
轮询：手动检查每个 fd 的状态。
事件驱动：内核监视 fd 状态变化，只有当事件发生时才通知应用程序。

---

# 二、 Reactor 模式简介
Reactor 模式是一种事件驱动型同步 I/O 的设计模式，核心思想是：**应用程序发起 I/O 操作后立即返回，由操作系统在后台完成实际的读写工作，完成后再通知应用程序。** 
这与 Proactor 模式的区别在于，Reactor 模式需要应用程序自己调用 `read`/`write` 来搬运数据，而 Proactor 模式则由操作系统负责搬运数据。
Reactor 模式的核心组件包括：
1. **Event Handler**（事件处理器）：处理 I/O 事件的业务逻辑。
2. **Reactor**：负责监听事件并分发到对应的处理器。
3. **Synchronous I/O**：应用程序需要自己调用 `read`/`write` 来搬运数据。

---

# 三、 核心：epoll 内核全景图

## 1. 递归拆解核心对象：eventpoll
当你调用 `epoll_create` 时，内核会创建一个 `struct eventpoll` 对象。这是一个**顶级容器**，我们通过递归视角看它包含了什么：

**`struct eventpoll` (核心管家)**
- **`rb_root_cached rbr`**：**红黑树**的根节点，这是整棵树的入口，索引了所有被监听的 FD。
- **`struct list_head rdllist`**：**就绪双向链表**的头节点，存放已就绪的事件。
- 一些其他成员变量，如节点数量、锁、等待队列等。

## 2. epitem：监听的基本单元
`epitem` 是内核管理单个 FD 的最小单位，通过包含红黑树结构的指针部分和链表结构的指针部分，实现**同时作为红黑树节点和链表节点**，其核心结构为监听的fd与监听的事件类型。

**`struct epitem` (监听实体)**：
- **`rb_node rbn`**：**红黑树节点**。
  - **节点指针**：`rbn` 内部包含 `rb_left`, `rb_right`, `rb_parent` 指针和`rb_color`，构成了红黑树的结构。
    - **索引机制**：当你调用 `epoll_ctl(ADD)` 时，内核会将 `epitem` 插入到 `eventpoll` 的红黑树中，以 fd 作为索引键。
- **`list_head rdlink`**：**就绪链表节点**。
  - **节点指针**：`rdlink` 内部包含 `next`, `prev` 指针，构成了就绪链表的结构。
    - **挂载机制**：当事件发生时，内核会将 `epitem` 的 `rdlink` 挂载到 `eventpoll` 的 `rdllist` 中。
- **`int rdy`**：就绪状态标志，0 表示未就绪，1 表示已就绪。
- **`struct epoll_event event`**：存储了用户空间传入的事件掩码和数据。
  - **`events`**：事件类型掩码（如 `EPOLLIN`, `EPOLLOUT`）。
    - **事件类型**：内核通过 `events` 字段知道这个 `epitem` 监听的是什么事件（可读、可写、异常等）。并在对应事件发生时将其挂载到就绪链表。
  - **`data`**：用户空间传入的数据。是联合体(union)，可以存储不同类型的数据：
    - **`data.ptr`**：通常存储用户空间 Handler 对象的指针，内核通过 `copy_from_user` 将其复制到 `event` 成员中。
    - **`data.fd`**：也可以存储 fd 本身，但在 Reactor 模式中更常用 `data.ptr` 来存储业务处理器对象的地址。
- **`epoll_filefd ffd`**：指向被监听的 fd 的文件结构体，内核通过它来访问 fd 的状态和事件。

可以看到`epitem` 的设计非常巧妙，既满足了快速查找（红黑树）又满足了高效就绪管理（链表），同时通过 `event` 成员实现了用户空间与内核空间的数据传递。有下列特点：
1. **侵入式 (Intrusive)**：节点结构被直接物理嵌入在数据结构 `epitem` 内部。
2. **多重挂载（并行轨道）**：同一个 `epitem` 对象可以**同时运行在两条轨道上**：它始终位于红黑树中用于快速查找，而当事件发生时，它又会通过内部的链表钩子挂载到就绪链表中。
3. **零拷贝迁移**：挂载的本质只是**指针指向的变更**。这意味着从未就绪到就绪的转变，不需要任何内存申请或对象搬运。

同时要注意`events`的双重角色：它同时传递了监听什么与怎么处理的指令：
- 内核通过`event`来确定监听的事件
- 用户通过`data`来存储业务处理器对象的地址，便于用户在获取到就绪事件时调用处理函数。

## 3. 从硬件中断到就绪链表的递交 (Pipeline)

1. **网卡收包**：数据到达网卡，网卡通过 DMA 写入内存，发出**硬件中断**
    - **硬件中断**：网卡向 CPU 发送的信号，通知有数据到达。
2. **内核响应**：CPU 响应中断，内核协议栈（TCP/IP）层层解析，将数据放入对应的 Socket 接收缓冲区。
3. **触发回调**：Socket 缓冲区状态改变，会触发挂在其等待队列上的回调函数 **`ep_poll_callback`**。
   - **Socket等待队列**：挂载所有等待该 Socket 事件的进程（如`recv()` 阻塞的进程），但`epoll`不仅挂载了`epitem`对象，还同时挂载了回调函数`ep_poll_callback`。
4. **提交就绪**：`ep_poll_callback` 执行，若监视到事件发生，将对应的 `epitem` 节点挂载到 `eventpoll` 对象中的 **Ready List (就绪链表)**。
5. **唤醒进程**：如果原本有进程阻塞在 `epoll_wait`，此时会被唤醒。
   - **触发模式**：
     - **LT (水平触发)**：只要缓冲区里有数据，`epoll_wait` 就会持续返回该事件。
     - **ET (边缘触发)**：仅在状态发生变化（由无到有，或数据增加）时触发一次，之后需要用户程序通过死循环读干缓冲区才能再次触发。

---

# 四、 API

## 1. 核心 API
### **`epoll_create1(int flags)`**
- 作用：创建 epoll 实例。
- 参数：`flags`：标志位
  - `EPOLL_CLOEXEC`：设置该标志后，子进程通过 `exec` 执行新程序时会自动关闭该 epoll 文件描述符，避免资源泄漏。
  - `0`：不设置任何标志。
- 返回值`int`：成功返回 epoll 文件描述符，失败返回 -1。

### **`epoll_ctl(int epid, int op, int sockid, struct epoll_event *event)`**
- 作用：控制 epoll 实例，将传入的参数打包为一个`epitem`，执行插入、（只比较fd的）修改或删除操作。
- 参数：
  - `epid`：epoll 文件描述符。
  - `op`：操作类型
    - `EPOLL_CTL_ADD`：添加一个新的 socket 监听。
    - `EPOLL_CTL_MOD`：更新已监听的 socket 的事件类型。
    - `EPOLL_CTL_DEL`：删除一个已监听的 socket。
  - `sockid`, `event`：被打包成的`epitem`对象的核心数据。
- 返回值`int`：成功返回 0，失败返回 -1。

### **`epoll_wait(int epid, struct epoll_event *events, int maxevents, int timeout)`**
- 作用：将就绪链表中的事件复制到用户空间的 `events` 数组中，并返回就绪事件的数量。若没有事件就绪，则根据 `timeout` 参数决定是否阻塞等待。
- 参数：
  - `epid`：epoll 文件描述符。
  - `events`：用户空间的事件数组，用于接收就绪事件。
  - `maxevents`：`events` 数组的最大容量。
  - `timeout`：等待事件的超时时间，单位为毫秒。
    - `-1`：无限等待，直到至少有一个事件就绪。
    - `0`：立即返回，无论是否有事件就绪。
    - `>0`：等待指定的毫秒数，如果超时则返回 0。
- 返回值`int`：成功返回就绪事件的数量，失败返回 -1。

### **`epoll_event_callback(struct eventpoll *ep, int sockid, uint32_t event)`**
- 作用：这是内核中的回调函数，当某个 socket 的状态发生变化时被调用。它会将对应的 `epitem` 挂载到就绪链表中，并唤醒等待的进程。
- 参数：
  - `ep`：指向 `eventpoll` 对象的指针。
  - `sockid`：发生事件的 socket 文件描述符。
  - `event`：事件类型掩码，指示发生了什么事件（如可读、可写等）。

## 2. 辅助 API
### **`fcntl(fd, int cmd, ...)`**
- 作用：**file control** ，通过命令对fd执行操作
- 参数：
  - `cmd`：
    - `F_SETFL`：设置文件标识符为后面的参数
      - `O_NONBLOCK`：设置非阻塞模式。
    - `F_GETFL`：获取当前文件标识符的状态。

一般在网络编程中，我们会将监听的 socket 和客户端连接的 socket 都设置为非阻塞模式，以配合 epoll 的事件驱动机制。
```cpp
int flags = fcntl(fd, F_GETFL, 0);
fcntl(fd, F_SETFL, flags | O_NONBLOCK);
```

---

# 五、 完整 C++ OOP 代码实现

```cpp
#include <sys/epoll.h>
#include <fcntl.h>
#include <unistd.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <iostream>
#include <vector>
#include <cstring>

#define MAX_EVENTS 64

// 设置非阻塞辅助函数
void setNonBlocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

class Reactor;

// 抽象事件处理器
class EventHandler {
public:
    virtual ~EventHandler() { close(fd); }
    virtual void handleEvent(uint32_t events) = 0;
    int getFd() const { return fd; }
protected:
    int fd;
    Reactor* reactor;
};

// 反应器中心
class Reactor {
public:
    Reactor() { epollFd = epoll_create1(EPOLL_CLOEXEC); }
    ~Reactor() { close(epollFd); }

    void addHandler(EventHandler* handler, uint32_t events) {
        struct epoll_event ev;
        ev.events = events;
        ev.data.ptr = handler; // 将 Handler 对象指针存入内核副本
        epoll_ctl(epollFd, EPOLL_CTL_ADD, handler->getFd(), &ev);
    }

    void removeHandler(EventHandler* handler) {
        epoll_ctl(epollFd, EPOLL_CTL_DEL, handler->getFd(), nullptr);
        delete handler;
    }

    void run() {
        struct epoll_event events[MAX_EVENTS];
        while (true) {
            int n = epoll_wait(epollFd, events, MAX_EVENTS, -1);
            for (int i = 0; i < n; ++i) {
                EventHandler* h = static_cast<EventHandler*>(events[i].data.ptr);
                h->handleEvent(events[i].events);
            }
        }
    }
private:
    int epollFd;
};

// Echo 处理器（ET 模式实战）
class EchoHandler : public EventHandler {
public:
    EchoHandler(int client_fd, Reactor* r) {
        fd = client_fd;
        this->reactor = r;
        setNonBlocking(fd);
    }
    void handleEvent(uint32_t events) override {
        if (events & EPOLLIN) {
            char buf[1024];
            while (true) { // ET 模式需配合死循环读干
                ssize_t len = read(fd, buf, sizeof(buf));
                if (len > 0) write(fd, buf, len);
                else if (len == 0) { reactor->removeHandler(this); return; }
                else if (errno == EAGAIN) break; // 缓冲区已净，等待下次触发
                else { reactor->removeHandler(this); return; }
            }
        }
    }
};

// Acceptor 处理器
class AcceptorHandler : public EventHandler {
public:
    AcceptorHandler(int listen_fd, Reactor* r) {
        fd = listen_fd;
        this->reactor = r;
    }
    void handleEvent(uint32_t events) override {
        struct sockaddr_in addr;
        socklen_t len = sizeof(addr);
        int client_fd = accept(fd, (struct sockaddr*)&addr, &len);
        if (client_fd >= 0) {
            std::cout << "New Client: " << inet_ntoa(addr.sin_addr) << std::endl;
            reactor->addHandler(new EchoHandler(client_fd, reactor), EPOLLIN | EPOLLET);
        }
    }
};

int main() {
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(8888);
    addr.sin_addr.s_addr = INADDR_ANY;

    bind(listen_fd, (struct sockaddr*)&addr, sizeof(addr));
    listen(listen_fd, SOMAXCONN);

    Reactor reactor;
    reactor.addHandler(new AcceptorHandler(listen_fd, &reactor), EPOLLIN);
    std::cout << "Reactor Echo Server running on port 8888..." << std::endl;
    reactor.run();
    return 0;
}
```

---

# 结论

`epoll` 是 Linux 内核通过**红黑树**、**就绪链表**和**回调机制**构建的一套高效“订阅-通知”系统。通过将业务逻辑封装在 `EventHandler` 中，并利用 `epoll_ctl` 的副本机制将对象地址注入内核，我们就能构建出高性能、可扩展的 Reactor 并发服务器。
