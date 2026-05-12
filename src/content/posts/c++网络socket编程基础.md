---
title: c++网络socket编程基础
published: 2026-04-23
description: '仅仅是一个总的大纲，后续会拆分'
image: ''
tags: [Socket, 网络编程]
category: '网络'
series: 'C++网络编程'
draft: false
lang: 'zh_CN'
---

# 一、Socket 的本质与抽象机制

## 1. Socket 定义
Socket（套接字）是应用层与传输层之间的软件抽象接口。
- **本质**：网络通信的逻辑终点。在内核中表现为一组由协议栈管理的数据结构
- **术语解释**：
  - `sa` (Socket Address)：通用地址前缀
  - `sin` (Socket Internet)：IPv4 协议族地址前缀
  - `af` (Address Family)：地址族
- **输入需求**：需提供 **IP 地址**（网络定位）与 **端口号**（进程检索）
- **功能描述**：屏蔽底层物理链路细节，为应用程序提供透明的字节流或数据报收发能力

## 2. 文件描述符 (fd) 的作用
基于 Unix 系统的“一切皆文件”设计范式，Socket 被抽象为一种特殊的文件资源。
- **资源分配**：调用 `socket()` 时，内核给进程分配一个整型索引值，即 `fd`
- **作用域与唯一性**：
  - **进程内唯一**：在一个进程内部，`fd` 是唯一的，不同数字代表不同的文件资源
  - **进程间可重复**：`fd` 仅仅是进程内部“打开文件表”的下标。因此，进程 A 中的 `fd=3` 可能指向一个网页连接，而进程 B 中的 `fd=3` 可能指向本地的一个日志文件
- **句柄 (Handle) 机制**：`fd` 本质上是一个“句柄”
  - **定义**：句柄是一个安全地引用内核资源的“代号”
  - **逻辑**：应用程序无法也不应该直接访问内核内存中的套接字对象。内核交给应用层一个数字（代号），应用层后续操作只需出示这个数字，由内核通过该数字在内部表中索引并找到真实的资源对象。这实现了**资源所有权维护**与**地址空间隔离**

## 3. 地址结构体对比

### (1) struct sockaddr (通用结构体)
```cpp
struct sockaddr {
    unsigned short sa_family;    // 地址族 (2 字节)
    char sa_data[14];            // 协议特定地址数据 (14 字节)
};
```

### (2) struct sockaddr_in (IPv4 专用结构体)
```cpp
struct sockaddr_in {
    short            sin_family;   // 地址族 AF_INET (2 字节)
    unsigned short   sin_port;     // 16 位端口号 (2 字节)
    struct in_addr   sin_addr;     // 32 位 IP 地址 (4 字节)
    char             sin_zero[8];  // 填充位 (8 字节)，确保总大小与 sockaddr 一致
};
```

# 二、网络信号传输与异步处理

在网络编程中，内核常通过“信号”通知进程发生的异步事件。

### 1. SIGPIPE (路径损坏)
- **触发逻辑**：当进程尝试向一个**已经关闭**（对端已发送 `FIN` 或 `RST`）的连接中写入数据时，内核会发送此信号
- **默认行为**：**退出进程**。这在生产环境中是极其危险的
- **应对方案**：
  - 在 `send` 调用时使用 `MSG_NOSIGNAL` 标志位
  - 在程序启动时显式忽略该信号：`signal(SIGPIPE, SIG_IGN);`

### 2. SIGHUP (挂起/配置更新)
- **触发逻辑**：原指终端连接断开。在现代后端开发中，常用于在不重启进程的情况下通知程序**重新加载配置文件**
- **场景**：当你通过 SSH 连接运行服务器，断开连接时若未处理此信号，服务器可能会退出

### 3. SIGURG (紧急数据到来)
- **触发逻辑**：当 TCP 接收到 **OOB（Out-Of-Band）** 数据时触发
- **背景**：TCP 协议头中有一个“紧急指针”。为了让接收端立刻感知到这部分高优先级数据（如控制台的 `Ctrl+C` 指令），内核会通过 `SIGURG` 通知应用层

---

# 三、Socket 核心函数详解

## 1. 建立阶段函数

### `socket(int domain, int type, int protocol)` - 创建套接字端点
- **作用**：由内核分配通信资源并返回索引。
- **参数**：
  - `domain`：地址族
    - `AF_INET`: IPv4
    - `AF_INET6`: IPv6
    - `AF_UNIX`: 本地通信
    - `AF_PACKET`: 直接访问链路层
    - `AF_NETLINK`: 内核与用户空间通信
  - `type`：套接字类型
    - `SOCK_STREAM`: 流式套接字（TCP）
    - `SOCK_DGRAM`: 数据报套接字（UDP）
  - `protocol`：传输协议 ip protocol
    - `0`: 系统自动推导
    - `IPPROTO_TCP`: TCP 
    - `IPPROTO_UDP`: UDP
    - `IPPROTO_ICMP`: ICMP
    - `IPPROTO_RAW`: 原始套接字
    - `IPPROTO_IP`: IP 层套接字
- **返回值**：
  - `unsigned int fd`：成功返回套接字描述符
  - `-1`：失败返回错误码

### `bind(int sockfd, const struct sockaddr *addr, socklen_t addrlen)` - 绑定标识
- **作用**：将本地协议地址（IP+端口）与套接字关联
- **参数**：
  - `sockfd`：套接字描述符
  - `addr`：地址结构体指针
  - `addrlen`：地址结构体长度
- **操作逻辑**：服务器通过此函数固定监听端口，以便客户端接入
- **返回值**：成功返回 0，失败返回 -1

### `listen(int sockfd, int backlog)` - 置于监听状态
- **作用**：服务端**异步**监听指定端口，准备接受连接。将主动套接字转为**被动模式**
  - **全连接队列 (Accept Queue)**：存储已完成三次握手、等待被应用层 `accept` 的连接
  - **半连接队列 (SYN Queue)**：存储已收到 SYN 报文、处于 `SYN_RCVD` 状态的连接
- **参数**：
  - `sockfd`：套接字描述符
  - `backlog`：全连接队列的最大容量。若队列溢出，客户端可能会收到拒绝响应
- **返回值**：成功返回 0，失败返回 -1

### `connect(int sockfd, const struct sockaddr *addr, socklen_t addrlen)` - 发起连接
- **作用**：客户端向服务器发起连接请求（主动操作）
  - **TCP (三次握手)**：触发 `SYN` 发送。成功返回标志着 **ESTABLISHED** 状态达成。该过程默认是**阻塞**的
  - **UDP**：仅在内核中记录目标地址，优化后续 IO 操作
- **参数**：
  - `sockfd`：本地套接字描述符
  - `addr`：目标服务器地址
  - `addrlen`：地址长度
- **返回值**：成功返回 0，失败返回 -1。

### `accept(int sockfd, struct sockaddr *addr, socklen_t *addrlen)` - 完成连接
- **作用**：
  - 从内核的全连接队列中取出一个已就绪的连接，并建立用户层的索引（fd）
  - 若队列为空，进程将挂起直到新的连接完成三次握手
- **参数**：
  - `sockfd`：监听描述符
  - `addr`：指向 `sockaddr` 结构体的指针，用于接收对端地址
  - `addrlen`：指向长度变量的指针。表示 `addr` 的缓冲区大小
- **返回值**：int
  - `> 0`：已连接套接字的描述符（新文件索引）
  - `-1`：失败
- **传入参数改变**：若不为 `NULL`，内核会将对端地址信息写入 `addr` 指向的内存区域，并更新 `addrlen` 为实际写入的长度。

## 2. 数据传输与工具函数

### `send(int sockfd, const void *buf, size_t len, int flags)` - 发送数据
- **作用**：通过已建立连接的套接字发送数据
- **参数**：
  - `sockfd`：目标套接字描述符
  - `buf`：待发送数据的缓冲区
  - `len`：数据字节长度
  - `flags`：控制标志
    - `0`: 默认行为，内核会自动处理分片和重传
    - `MSG_NOSIGNAL`: 对端关闭时不产生 `SIGPIPE` 信号（防止程序意外退出）
    - `MSG_OOB`: 发送紧急数据
- **返回值**：int
  - `> 0`: 实际发送的字节数（可能小于想发的数据量）
  - `-1`: 失败

### `recv(int sockfd, void *buf, size_t len, int flags)` - 接收数据
- **作用**：从套接字接收数据
- **操作逻辑**：
  - **阻塞特性**：默认情况下，若缓冲区无数据，函数会一直等待
  - **连接状态判定**：若返回值为 `0`，表示对端已关闭连接（此时应立即关闭本地 fd）
- **参数**：
  - `sockfd`：数据来源套接字描述符任务
  - `buf`：存储接收数据的缓冲区
  - `len`：缓冲区最大容量
  - `flags`：控制标志
    - `0`: 默认行为，内核会自动处理分片和重传
    - `MSG_PEEK`: 查看缓冲区数据但不删除（用于预读协议头）
    - `MSG_WAITALL`: 强制等待直到接收满 `len` 字节（除非出错或对端关闭）
- **返回值**：int
  - `> 0`：实际接收的字节数
  - `0`：经由 TCP 四次挥手，对端已关闭
  - `-1`：发生错误

### `inet_pton`和`inet_ntop` - 地址转换
#### `inet_pton(int af, const char *src, void *dst)`
- **作用**：将人类可读的字符串（如 "127.0.0.1"）转换为内核可读的二进制网络序格式。
- **命名解释**：**p**resentation **t**o **n**etwork（表达态转为网络态）。
- **参数**：
  - `af`：地址族
    - `AF_INET`: IPv4
    - `AF_INET6`: IPv6
  - `src`：字符串地址
  - `dst`(destination)：存储二进制结果的目标指针（通常指向 `sin_addr`）
- **返回值**：int
  - `1`: 成功
  - `0`: 格式无效
  - `-1`: 错误
- **传入参数改变**
  - `des`: 写入转换后的二进制地址数据，可以传给`s_addr`

#### `inet_ntop(int af, const void *src, char *dst, socklen_t size)`
与上面类似
- **参数**:
  - `size`: `dst`缓冲区大小，必须足够容纳转换后的字符串（IPv4 至少 16 字节，IPv6 至少 46 字节）
- **返回值**: 成功返回 `dst` 指针，失败返回 `NULL`。

### `sendto` 与 `recvfrom` - 无连接数据收发
- **应用场景**：主要用于 **UDP**。由于 UDP 无连接，每次发送都必须指定目标，每次接收都要记录来源。
- **sendto 核心**：在 `send` 基础上增加了 `dest_addr` 参数。
  - **返回值**：成功返回实际发送字节数，失败返回 `-1`。
- **recvfrom 核心**：在 `recv` 基础上增加了 `src_addr` 参数（使用指针传出）。
  - **返回值**：成功返回实际接收字节数，对端正常关闭返回 `0`，失败返回 `-1`。

### `close` 与 `shutdown` - 终止连接
- **`close(fd)`**：
  - **引用计数**：只有当 `fd` 的引用计数变为 0 时，内核才释放资源并触发 TCP 的 `FIN`。
  - **彻底关闭**：调用后进程无法再通过该 `fd` 发送或接收数据。
  - **返回值**：成功返回 `0`，失败返回 `-1`。
- **`shutdown(fd, how)`**：
  - **强制性**：无视引用计数，直接触发连接终止。
  - **半关闭 (Half-close)**：支持关闭读（`SHUT_RD`）、关闭写（`SHUT_WR`）或两者（`SHUT_RDWR`）。这在“确保数据发完后等待对方确认”的场景中非常关键。
  - **返回值**：成功返回 `0`，失败返回 `-1`。

### `getpeername` 与 `getsockname` - 获取地址信息
- **`getpeername(int sockfd, struct sockaddr *addr, socklen_t *addrlen)`**：
  - **作用**：获取与套接字 `sockfd` 连接的**对端**（Client）的 IP 和端口。
  - **存储位置**：对端地址信息会被内核写入 `addr` 指向的内存区域，实际长度写入 `addrlen`。
  - **返回值**：成功返回 `0`，失败返回 `-1`。
- **`getsockname(int sockfd, struct sockaddr *addr, socklen_t *addrlen)`**：
  - **作用**：获取**本地**套接字当前的 IP 和端口（常用于验证 `bind` 结果或查看系统自动分配的端口）。
  - **存储位置**：本地地址信息写入 `addr`，长度写入 `addrlen`。
  - **返回值**：成功返回 `0`，失败返回 `-1`。

### `gethostname` - 获取主机名
- **`gethostname(char *name, size_t len)`**：
  - **作用**：获取当前运行环境的机器名。
  - **存储位置**：机器名（以 `\0` 结尾的字符串）被写入 `name` 数组中，`len` 指定数组大小。
  - **返回值**：成功返回 `0`，失败返回 `-1`。
---

# 三、进阶知识与常见问题

## 1. 字节序转换逻辑
- `htons()`：**h**ost **t**o **n**etwork **s**hort（16位端口）。
- `htonl()`：**h**ost **t**o **n**etwork **l**ong（32位IP）。
- `ntohs()`：**n**etwork **t**o **h**ost **s**hort（接收端还原）。
- `ntohl()`：**n**etwork **t**o **h**ost **l**ong（接收端还原）。
上述函数的参数和返回值都是无符号整数（`uint16_t` 或 `uint32_t`）。

## 2. 套接字选项：SO_REUSEADDR
在调试阶段，若频繁重启服务器，可能会遇到 `Address already in use` 错误。
- **原因**：TCP 连接关闭后，主动关闭方会进入 `TIME_WAIT` 状态（通常持续 1-4 分钟），导致该 IP+Port 组合被内核锁定。
- **方案**：在 `bind` 之前设置 `setsockopt` 允许强制重用处于等待状态的端口。
```cpp
int opt = 1;
setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
```
具体内容可以看[setsockopt函数概念和使用案例](https://blog.csdn.net/weixin_42108533/article/details/149673874)。

## 3. 并发 IO 模型：从阻塞到多路复用
默认情况下，Socket 是**同步阻塞**的（如 `recv` 会一直等）。处理高并发（海量连接）时，主要有以下演进路径：

### (1) 多线程/多进程 (PPC/TPC)
- **逻辑**：每来一个连接，开一个新线程处理。
- **缺点**：线程切换开销极大，内存占用高，无法应对万级并发（C10K 问题）。

### (2) IO 多路复用 (Multiplexing)
这是现代高性能内核的核心机制。其精髓在于：**用一个线程监控多个 fd 的状态**。

#### A. select (老牌/跨平台)
- **机制**：应用层传入一个 `fd_set` 位图（Bitmap），内核轮询检查。
- **限制**：
  - **连接数限制**：通常硬编码为 1024。
  - **性能瓶颈**：每次调用都要把 `fd_set` 从用户态拷贝到内核态，且内核需要 $O(n)$ 线性扫描，效率随连接数增加而骤降。

#### B. poll (过渡方案)
- **机制**：基于链表存储 fd。
- **改进**：解除了 1024 的连接数限制。
- **遗憾**：依然需要线性扫描，性能问题未根治。

#### C. epoll (Linux - 事件驱动 - Reactor)
- **核心部分**：
  1. `epoll_create`：在内核创建一个红黑树，用于高效挂载要监控的 fd。
  2. `epoll_ctl`：将 fd 添加到红黑树，并注册回调函数。
  3. `epoll_wait`：等待连接事件发生。
- **？！强强？！**
  - **红黑树**：增删改查 fd 的复杂度为 $O(\log n)$。
  - **就绪链表 (The Ready List)**：数据到达时，内核通过回调直接把 fd 扔进链表。`epoll_wait` 只需读取链表，无需扫描所有 fd，复杂度为 $O(1)$。
  - **模式区别**：
    - **LT (水平触发)**：只要数据没读完，内核就一直提醒你（安全）。
    - **ET (边缘触发)**：数据到了只提醒一次，你必须一次性读完（性能）。
  - **共享内存 (Memory Map)**：
    - **原理**：将文件或内核驱动的一块内存区域直接**映射**到进程的虚拟地址空间。
    - **优势**：在 `epoll` 场景下，内核与应用层可以通过这块共享区域交换事件数据，避免了传统的 `read/write` 系统调用时将数据在内核态和用户态之间来回搬运（CPU 拷贝）的开销。

可以看[Linux epoll完全图解，彻底搞懂epoll机制](https://zhuanlan.zhihu.com/p/17856755436)

#### D. IOCP (Windows - 异步 IO - Proactor)
真正的异步执行。应用层只下达读取指令，**数据在内核与程序内存之间的搬运全部由操作系统后台完成**。搬完后系统再喊程序来用现成的。
- **主流程**：下发 `WSARecv` (非阻塞立即返回) -> 系统层后台搬运数据 -> 工作线程从 `完成端口队列` 取出处理好的数据。

**具体细节**
- **前摄器模式 (Proactor)**：不同于 epoll（Reactor 模型，内核只告诉你“可以读了”，你还得自己去搬数据），IOCP 帮你做全套：不仅通知你，还直接把数据存进了你事先指定的内存块。
- **完成端口 (Completion Port)**：本质是一个高效的内核队列。当系统默默把数据拷贝进用户的缓冲区后，会将“完成包（含结果）”放入该队列，供应用层消费。

可以看[Windows网络编程之IOCP模型深度解析](https://blog.csdn.net/lzllln/article/details/146108369)
## 4. Windows 环境特别说明：为什么需要 `WSAStartup`？
在 Windows 上进行 Socket 编程，必须调用 `WSAStartup`，而在 Linux 上不需要。这是由两者的设计理念差异决定的：

### (1) `WSAStartup` 的意义
Windows 的 Socket (Winsock) 最初是在 90 年代初作为**外部动态链接库 (DLL)** 引入的，并不是内核的原生组成部分。
- **动态库初始化**：`WSAStartup` 的首要任务是通知操作系统：程序准备使用 `ws2_32.dll` 库，并建立引用计数。
- **协议协商**：`MAKEWORD(2,2)` 告诉内核程序期望的 Winsock 版本。如果系统支持，内核会返回实际可用的版本及相关限制信息。
- **资源分配**：内核会为该进程分配必要的内部数据结构和内存池。

### (2) 为什么 Linux 不需要？
- **内核原生支持**：在 Unix/Linux 系统中，Socket 是操作系统的核心组成部分（一切皆文件理念）。TCP/IP 协议栈直接集成在内核中，无需通过外部 DLL 映射。
- **ABI 稳定性**：Linux 的系统调用接口（System Call）极其稳定且向后兼容，不需要像 Windows 那样进行复杂的动态库版本协商。

### (3) `WSACleanup` 的作用
与初始化对应，`WSACleanup` 负责释放 DLL 资源、递减引用计数并清理未完成的异步任务，防止内存泄漏。

---

# 四、完整 TCP 编程示例
## windows + linux 服务端
c++20 标准，跨平台（Windows + Linux）TCP Echo 服务器示例。
多线程支持多客户端并发连接。
控制台输入 `close` 关闭服务器，客户端输入`exit`断开链接。
```cpp
#include <algorithm>
#include <iostream>
#include <string>
#include <thread>
#include <vector>
#include <atomic>
#include <mutex>

// 平台兼容性处理
#ifdef _WIN32
    #include <winsock2.h>
    #include <ws2tcpip.h>
    #pragma comment(lib, "ws2_32.lib")
    using SOCKET_TYPE = SOCKET;
    constexpr SOCKET_TYPE INVALID_SOCKET_VALUE = INVALID_SOCKET;
    inline void close_socket(SOCKET_TYPE s) { closesocket(s); }
    inline int get_error() { return WSAGetLastError(); }
#else
    #include <sys/socket.h>
    #include <netinet/in.h>
    #include <arpa/inet.h>
    #include <unistd.h>
    using SOCKET_TYPE = int;
    const SOCKET_TYPE INVALID_SOCKET_VALUE = -1;
    inline void close_socket(SOCKET_TYPE s) { close(s); }
    inline int get_error() { return errno; }
#endif

// 服务器配置
constexpr int PORT = 8888;
constexpr int BUFFER_SIZE = 1024;

// 全局状态
std::atomic<bool> server_running{true};// 服务器运行状态标志
std::vector<SOCKET_TYPE> client_sockets;
std::mutex clients_mutex;// 保护 client_sockets 的线程安全

// 辅助函数：将字符串转换为小写
std::string to_lower(std::string s) {
    std::ranges::transform(s, s.begin(), [](const unsigned char c){ return std::tolower(c);});
    //c++20 的 std::ranges::transform 直接在原字符串上进行转换，无需额外空间
    //相当于 std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c){ return std::tolower(c); });
    return s;
}

/**
  * @brief 处理客户端连接的函数
  * @param client_sock 已接受的客户端套接字描述符
  * @details 该函数在独立线程中运行，负责与客户端进行通信
  *          1. 循环接收客户端数据，直到连接关闭或服务器停止
  *          2. 每当接收到一行数据（以换行符结尾）时，检查是否为 "exit" 命令
  *          3. 如果是 "exit"，则关闭连接并退出线程；否则将数据原样返回给客户端
  *          4. 在连接关闭时，确保从全局客户端列表中移除该套接字
  */
void handle_client(const SOCKET_TYPE client_sock) {
    std::string line_buffer;
    char buf[BUFFER_SIZE];
    int bytes;

    while (server_running && (bytes = recv(client_sock, buf, sizeof(buf), 0)) > 0) {
        for (int i = 0; i < bytes; ++i) {
            line_buffer.push_back(buf[i]);
            if (buf[i] == '\n') {
                std::string cmd = line_buffer;
                // 去除行尾的换行符
                while (!cmd.empty() && (cmd.back() == '\n' || cmd.back() == '\r'))
                    cmd.pop_back();

                if (to_lower(cmd) == "exit") {
                    std::cout << "Client exits.\n";
                    close_socket(client_sock);
                    std::lock_guard<std::mutex> lock(clients_mutex);
                    const auto it = std::ranges::find(client_sockets, client_sock);
                    if (it != client_sockets.end()) client_sockets.erase(it);
                    return;
                }

                // 回显数据
                send(client_sock, line_buffer.c_str(), line_buffer.size(), 0);
                line_buffer.clear();
            }
        }
    }

    close_socket(client_sock);
    std::lock_guard<std::mutex> lock(clients_mutex);
    const auto it = std::ranges::find(client_sockets, client_sock);
    if (it != client_sockets.end()) client_sockets.erase(it);
}

// 主函数：服务器入口
int main() {
// Windows 环境下初始化 Winsock
#ifdef _WIN32
    WSADATA wsaData;
    WSAStartup(MAKEWORD(2, 2), &wsaData);
#endif
    // 创建监听套接字
    SOCKET_TYPE listen_sock = socket(AF_INET, SOCK_STREAM, 0);
    if (listen_sock == INVALID_SOCKET_VALUE) {
        std::cerr << "socket error\n";
        return 1;
    }
    
    //初始化地址结构体并绑定
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(PORT);
    if (bind(listen_sock, reinterpret_cast<sockaddr *>(&addr), sizeof(addr)) == -1) {
        std::cerr << "bind error\n";
        return 1;
    }

    // 进入监听状态
    if (listen(listen_sock, 5) == -1) {
        std::cerr << "listen error\n";
        return 1;
    }

    std::cout << "Echo server on port " << PORT << "\n";
    std::cout << "Client can send 'exit' to quit. Server console type 'close' to stop.\n";

    // 控制台输入线程
    std::thread console_thread([&listen_sock]() {
        std::string input;
        while (server_running && std::getline(std::cin, input)) {
            if (to_lower(input) == "close") {
                server_running = false;
                close_socket(listen_sock);
                //上锁阻止加入新的链接或删除链接
                std::lock_guard<std::mutex> lock(clients_mutex);
                for (const SOCKET_TYPE s : client_sockets)
                    close_socket(s);
                client_sockets.clear();
                break;
            }
        }
    });

    // 主循环：接受客户端连接
    std::vector<std::thread> workers;
    while (server_running) {
        sockaddr_in client_addr{};// 用于存储客户端地址信息
        socklen_t client_len = sizeof(client_addr);
        SOCKET_TYPE client_sock = accept(listen_sock, reinterpret_cast<sockaddr *>(&client_addr), &client_len);
        if (client_sock == INVALID_SOCKET_VALUE) {
            if (!server_running) break;
            std::cerr << "accept error\n";
            continue;
        }

        // ---------- 打印客户端 IP 和端口 ----------
        char ip_str[INET_ADDRSTRLEN];
        inet_ntop(AF_INET, &client_addr.sin_addr, ip_str, sizeof(ip_str));
        std::cout << "New connection from " << ip_str << ":" << ntohs(client_addr.sin_port) << std::endl;
        // ------------------------------------------------
        // ---------- 将新连接加入全局列表并启动处理线程 -------
        {
            std::lock_guard<std::mutex> lock(clients_mutex);
            client_sockets.push_back(client_sock);
        }
        workers.emplace_back(handle_client, client_sock);
        // ------------------------------------------------
    }

    for (auto& t : workers) if (t.joinable()) t.join();
    console_thread.join();

    close_socket(listen_sock);
#ifdef _WIN32
    WSACleanup();
#endif
    std::cout << "Server stopped.\n";
    return 0;
}
```
