---
title: 第十章 系统级I/O
published: 2026-09-08
description: ""
image: ""
tags: []
category: ""
draft: false
lang: ""
---

> [!note]
> 这一章的核心问题是：程序如何用内核提供的接口读取文件、写入文件、访问目录，以及在多个进程之间共享打开的文件。

> [!tip]
> 关键思想很简单：Linux 把所有 I/O 设备都抽象成"文件"。这样，磁盘、终端、管道和网络都可以用统一的读写接口来处理。

输入/输出（I/O）是在主存和外部设备之间复制数据的过程。输入是从设备到主存，输出是从主存到设备。

所有高级语言的运行时系统都会提供更方便的 I/O 抽象，例如 C 的标准 I/O 库提供了 `printf`、`scanf`、`fgets` 这些函数。它们底层最终依赖于 Unix 提供的系统级接口。

为什么还要学习 Unix I/O？

- **它帮助你理解其他系统概念**。I/O 和进程、文件共享、虚拟内存、网络编程是相互依赖的。
- **有时高级 I/O 不能满足需求**。例如标准 I/O 没有直接暴露文件元数据接口。
- **标准 I/O 函数不是异步信号安全的**。第八章讲过，信号处理程序只能调用异步信号安全的函数（如 `write`），不能调用 `printf` 这类标准 I/O 函数——这正是 Unix I/O 无法被高层封装完全取代的原因之一。
- **对网络编程来说，底层的 I/O 语义必须被理解**，才能正确处理短读、短写和 EOF。

这一章会介绍 Unix I/O 的核心模型，以及如何在 C 程序中可靠地使用它。

---

# 第一部分 Unix I/O 模型

## 10.1 Unix I/O

Linux 对文件的抽象非常统一：一个文件就是一个长度为 $m$ 的字节序列：

$$B_0, B_1, \dots, B_k, \dots, B_{m-1}$$

无论底层设备是什么，内核都把它们当成"文件"来管理。这样一来，磁盘、终端、网络 socket 都能用同一组接口访问：打开文件、改变当前文件位置、读写文件、关闭文件。

> [!example]
> 每个进程启动时，内核都会自动打开三个文件：标准输入、标准输出和标准错误。它们的描述符分别是 0、1、2。

打开文件后，内核会返回一个小的非负整数：**文件描述符**（file descriptor）。它是后续读写操作的句柄，应用程序通常不需要知道底层实现细节。

### 关键语义

- **读操作**：从当前文件位置 $k$ 开始，最多复制 $n$ 个字节到内存，并把位置更新为 $k + $ 实际传送的字节数
- **写操作**：从内存最多复制 $n$ 个字节到文件，并把位置更新为 $k + $ 实际传送的字节数
- **EOF**：读到文件尾部时，`read` 返回 0，而不是一个特殊的 EOF 字节
- **关闭文件**：进程完成访问后调用 `close`，内核释放对应资源，并把描述符还给描述符池

> [!warning]
> 位置的增量是**实际传送的字节数**，不一定等于请求的 $n$。二者相等只是常见情形，短读、短写发生时（见 §10.3）位置只会前进实际读写的量。

> [!warning]
> 这里的"文件尾"不表示有一个真实的 EOF 字符。EOF 是读操作返回 0 的状态，而不是文件内容里存在的特殊字节。

---

# 第二部分 基本文件操作

## 10.2 打开和关闭文件

进程通过 `open` 打开已有文件，或创建新文件：

```c
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

int open(char *filename, int flags, mode_t mode);
/* 返回：成功返回新文件描述符，失败返回 -1 */
```

`open` 把 `filename` 转换成一个描述符，返回的描述符通常是当前最小未使用的描述符值。

`flags` 指定访问方式：`O_RDONLY`（只读）、`O_WRONLY`（只写）、`O_RDWR`（可读可写）。还可以和以下标志组合：`O_CREAT`（文件不存在则创建）、`O_TRUNC`（打开时截断已有文件）、`O_APPEND`（每次写时都写到文件末尾）。

`mode` 仅在创建新文件时生效，指定访问权限位：

```c
fd = Open("foo.txt", O_RDONLY, 0);               /* 只读打开 */
fd = Open("foo.txt", O_WRONLY | O_APPEND, 0);    /* 只写打开，写入时追加到末尾 */
```

### 访问权限位

| 掩码      | 含义           |
| --------- | -------------- |
| `S_IRUSR` | 拥有者可读     |
| `S_IWUSR` | 拥有者可写     |
| `S_IXUSR` | 拥有者可执行   |
| `S_IRGRP` | 组成员可读     |
| `S_IWGRP` | 组成员可写     |
| `S_IXGRP` | 组成员可执行   |
| `S_IROTH` | 其他用户可读   |
| `S_IWOTH` | 其他用户可写   |
| `S_IXOTH` | 其他用户可执行 |

> [!note]
> 这组权限位在 `sys/stat.h` 中定义。文件权限并不是绝对安全机制，而是操作系统对访问控制的基础约束。

`umask` 会影响新建文件的默认权限：

```c
#define DEF_MODE   S_IRUSR | S_IWUSR | S_IRGRP | S_IWGRP | S_IROTH | S_IWOTH
#define DEF_UMASK  S_IWGRP | S_IWOTH

umask(DEF_UMASK);
fd = Open("foo.txt", O_CREAT | O_TRUNC | O_WRONLY, DEF_MODE);
```

最终权限是 `DEF_MODE & ~DEF_UMASK`：拥有者读写，组成员只读，其他用户只读。

关闭文件使用 `close`：

```c
#include <unistd.h>

int close(int fd);
/* 返回：成功返回 0，失败返回 -1 */
```

> [!warning]
> 关闭一个已经关闭的描述符会出错，不要重复释放同一描述符。

**练习**：以下程序输出什么？

```c
fd1 = Open("foo.txt", O_RDONLY, 0);
Close(fd1);
fd2 = Open("baz.txt", O_RDONLY, 0);
printf("fd2 = %d\n", fd2);
```

答案：`fd2 = 3`。进程启动时已有 0、1、2 三个描述符；第一次 `open` 返回 3；`close` 释放了 3；下一次 `open` 再次使用最小未使用描述符，因此也返回 3。

## 10.3 读和写文件

```c
#include <unistd.h>

ssize_t read(int fd, void *buf, size_t n);
/* 返回：成功返回读到的字节数；到达 EOF 返回 0；出错返回 -1 */

ssize_t write(int fd, const void *buf, size_t n);
/* 返回：成功返回写入的字节数；出错返回 -1 */
```

`read` 从当前文件位置复制最多 `n` 个字节到 `buf`；`write` 从 `buf` 复制最多 `n` 个字节到文件。

一次一字节地把标准输入复制到标准输出：

```c
#include "csapp.h"

int main(void)
{
    char c;
    while (Read(STDIN_FILENO, &c, 1) != 0)
        Write(STDOUT_FILENO, &c, 1);
    exit(0);
}
```

### 短计数

`read` 和 `write` 经常返回**短计数**——实际传输的字节数少于请求的字节数，这不一定表示错误。

`read` 常见原因：

- 读到 EOF：请求 50 字节，但文件只剩 20 字节
- 从终端读取文本：一次读到的是一整行，而不是任意长度
- 读取网络 socket：内部缓冲和网络延迟导致返回值小于请求值
- 读取管道：内核可能只提供部分字节

`write` 也会发生短计数，常见于：

- 写入的目标是 socket 或管道，而对方接收缓冲区已满，内核只接受了一部分数据
- 写入过程中被信号中断，只完成了部分传输

> [!warning]
> 对网络程序而言，短计数必须被当成正常情况处理。健壮程序不能假设一次 `read` 或 `write` 一定完成全部请求。

---

# 第三部分 健壮 I/O 与元数据

## 10.4 用 RIO 包健壮地读写

**RIO**（Robust I/O，健壮 I/O）自动处理短计数，提供两类函数：

- **无缓冲的 I/O**：`rio_readn`、`rio_writen`——直接反复调用底层 `read`/`write`
- **带缓冲的 I/O**：`rio_readlineb`、`rio_readnb`——通过内部缓冲区读取

> [!tip]
> 如果要写网络程序，RIO 是更稳妥的选择，它隐藏了很多短读、短写和信号中断的细节。

### 10.4.1 RIO 的无缓冲 I/O

```c
ssize_t rio_readn(int fd, void *usrbuf, size_t n)
{
    size_t nleft = n;
    ssize_t nread;
    char *bufp = usrbuf;

    while (nleft > 0) {
        if ((nread = read(fd, bufp, nleft)) < 0) {
            if (errno == EINTR)
                nread = 0;
            else
                return -1;
        }
        else if (nread == 0)
            break;
        nleft -= nread;
        bufp += nread;
    }
    return (n - nleft);
}
```

```c
ssize_t rio_writen(int fd, void *usrbuf, size_t n)
{
    size_t nleft = n;
    ssize_t nwritten;
    char *bufp = usrbuf;

    while (nleft > 0) {
        if ((nwritten = write(fd, bufp, nleft)) <= 0) {
            if (errno == EINTR)
                nwritten = 0;
            else
                return -1;
        }
        nleft -= nwritten;
        bufp += nwritten;
    }
    return n;
}
```

两者的实现思路相同：维持"还剩多少字节未处理"的计数，反复调用底层 `read`/`write`，遇到 `EINTR` 时重试，读到 EOF 时结束。它们把短读/短写包装成了更稳定的语义。

### 10.4.2 RIO 的带缓冲输入函数

若程序需要从文本文件中逐行读取，直接用裸 `read` 很低效——每个字节都要陷入内核。RIO 提供读缓冲区机制：

```c
#define RIO_BUFSIZE 8192

typedef struct {
    int rio_fd;
    int rio_cnt;
    char *rio_bufptr;
    char rio_buf[RIO_BUFSIZE];
} rio_t;

void rio_readinitb(rio_t *rp, int fd)
{
    rp->rio_fd = fd;
    rp->rio_cnt = 0;
    rp->rio_bufptr = rp->rio_buf;
}
```

内部核心函数 `rio_read` 在缓冲区为空时调用一次底层 `read`，再把字节复制到用户缓冲区：

```c
static ssize_t rio_read(rio_t *rp, char *usrbuf, size_t n)
{
    int cnt;
    while (rp->rio_cnt <= 0) {
        rp->rio_cnt = read(rp->rio_fd, rp->rio_buf, sizeof(rp->rio_buf));
        if (rp->rio_cnt < 0) {
            if (errno != EINTR)
                return -1;
        }
        else if (rp->rio_cnt == 0)
            return 0;
        else
            rp->rio_bufptr = rp->rio_buf;
    }
    cnt = n;
    if (rp->rio_cnt < n)
        cnt = rp->rio_cnt;
    memcpy(usrbuf, rp->rio_bufptr, cnt);
    rp->rio_bufptr += cnt;
    rp->rio_cnt -= cnt;
    return cnt;
}
```

`rio_readlineb` 逐字节读取，直到遇到换行符或达到 `maxlen-1`；`rio_readnb` 类似 `rio_readn`，但从读缓冲区中读取。一次一行地复制标准输入到标准输出：

```c
#include "csapp.h"

int main(int argc, char **argv)
{
    int n;
    rio_t rio;
    char buf[MAXLINE];

    Rio_readinitb(&rio, STDIN_FILENO);
    while ((n = Rio_readlineb(&rio, buf, MAXLINE)) != 0)
        Rio_writen(STDOUT_FILENO, buf, n);
}
```

> [!note]
> RIO 的设计目的不是替代标准 I/O，而是给网络编程提供一套更稳健、更容易控制的底层接口。

## 10.5 读取文件元数据

```c
#include <unistd.h>
#include <sys/stat.h>

int stat(const char *filename, struct stat *buf);
int fstat(int fd, struct stat *buf);
/* 返回：成功返回 0，失败返回 -1 */
```

`stat` 接收文件名，`fstat` 接收文件描述符。`struct stat` 中最重要的成员：

```c
struct stat {
    dev_t   st_dev;
    ino_t   st_ino;
    mode_t  st_mode;   /* 访问权限位和文件类型 */
    nlink_t st_nlink;
    uid_t   st_uid;
    gid_t   st_gid;
    off_t   st_size;   /* 文件字节数 */
    time_t  st_atime;
    time_t  st_mtime;
    time_t  st_ctime;
};
```

常用类型判断宏：`S_ISREG(m)`（普通文件）、`S_ISDIR(m)`（目录文件）、`S_ISSOCK(m)`（socket）。

```c
struct stat stat_buf;
Stat(argv[1], &stat_buf);

if (S_ISREG(stat_buf.st_mode))
    type = "regular";
else if (S_ISDIR(stat_buf.st_mode))
    type = "directory";
else
    type = "other";

readok = (stat_buf.st_mode & S_IRUSR) ? "yes" : "no";
```

## 10.6 读取目录内容

```c
#include <sys/types.h>
#include <dirent.h>

DIR *opendir(const char *name);
struct dirent *readdir(DIR *dirp);
int closedir(DIR *dirp);
```

`opendir` 返回目录流，`readdir` 返回下一个目录项，`closedir` 关闭目录流。每个目录项：

```c
struct dirent {
    ino_t d_ino;      /* inode 编号 */
    char  d_name[256]; /* 文件名 */
};
```

```c
DIR *streamp = Opendir(argv[1]);
struct dirent *dep;

errno = 0;
while ((dep = readdir(streamp)) != NULL)
    printf("Found file: %s\n", dep->d_name);
if (errno != 0)
    unix_error("readdir error");

Closedir(streamp);
```

> [!warning]
> `readdir` 到达结尾时返回 `NULL`，但也可能在错误时返回 `NULL`。正确做法是像上面这样先清零 `errno`，循环结束后检查它，以区分"到结尾"和"真正出错"。

---

# 第四部分 文件共享与重定向

## 10.7 共享文件

内核用三个相关的数据结构表示打开的文件：

- **描述符表**：每个进程独有，存放其打开文件的描述符
- **文件表**：所有进程共享，保存当前文件位置、引用计数和 v-node 指针
- **v-node 表**：所有进程共享，保存文件的元数据

这三层结构解释了文件共享的关键语义：多个描述符可以引用同一个文件；以同一个名字调用两次 `open` 会得到两个不同的打开文件表项，各自有自己的文件位置；父子进程 `fork` 后，子进程继承父进程的描述符表（描述符值相同），但这些描述符指向的是同一批文件表项，因而共享文件位置。

三道练习题分别对应三种情形：

| 场景                            | 文件表项                  | 文件位置                           |
| ------------------------------- | ------------------------- | ---------------------------------- |
| 两次独立 `open` 同一文件        | 各自独立                  | 各自独立，互不影响                 |
| `fork` 后父子进程共用同一描述符 | 共享同一项                | 共享，一方读写会影响另一方后续读写 |
| `dup2(fd2, fd1)` 后             | `fd1` 改为指向 `fd2` 的项 | 与 `fd2` 共享同一位置              |

**练习**：`fd1`、`fd2` 各自独立 `open` 同一文件后各读一字节，输出什么？

```c
fd1 = Open("foobar.txt", O_RDONLY, 0);
fd2 = Open("foobar.txt", O_RDONLY, 0);
Read(fd1, &c, 1);
Read(fd2, &c, 1);
printf("c = %c\n", c);
```

答案：`c = f`。`fd1` 和 `fd2` 各自有独立的打开文件表项，各自维护自己的当前位置，`fd2` 读到的仍是文件第一个字节。

**练习**：`fork` 后子进程先读一字节，父进程等待后再读，输出什么？

```c
fd = Open("foobar.txt", O_RDONLY, 0);
if (Fork() == 0) {
    Read(fd, &c, 1);
    exit(0);
}
Wait(NULL);
Read(fd, &c, 1);
printf("c = %c\n", c);
```

答案：`c = o`。父子进程共享同一个打开文件表项，子进程读完一个字节后，父进程读取的就是下一个字节。

## 10.8 I/O 重定向

shell 提供 `<` 和 `>` 运算符，把标准输入、标准输出重定向到文件：

```bash
linux> ls > foo.txt
```

C 语言中用 `dup2` 完成这种重定向：

```c
#include <unistd.h>

int dup2(int oldfd, int newfd);
/* 返回：成功返回非负描述符，失败返回 -1 */
```

`dup2` 把 `oldfd` 对应的文件表项复制到 `newfd`。如果 `newfd` 已经打开，`dup2` 会先关闭它。`dup2(4, 1)` 会把标准输出重定向到描述符 4 对应的文件。

**练习**：

```c
fd1 = Open("foobar.txt", O_RDONLY, 0);
fd2 = Open("foobar.txt", O_RDONLY, 0);
Read(fd2, &c, 1);
Dup2(fd2, fd1);
Read(fd1, &c, 1);
printf("c = %c\n", c);
```

答案：`c = o`。`fd1` 被重定向到 `fd2` 后，二者指向同一个打开文件表项，共享同一文件位置；`fd2` 先读了第一个字节，随后 `fd1` 读到的是第二个字节。

---

# 第五部分 标准 I/O 与选型

## 10.9 标准 I/O

C 语言提供一组高级 I/O 函数，称为**标准 I/O 库**（standard I/O library），如 `fopen`、`fclose`、`fread`、`fwrite`、`printf`、`scanf`。核心抽象是 **FILE 流**（stream），每个流对应一个 `FILE` 结构体，带有内部缓冲区。程序开始时就有三个标准流 `stdin`、`stdout`、`stderr`，分别对应描述符 0、1、2。

> [!tip]
> 对大多数磁盘和终端 I/O，标准 I/O 是首选。它以缓冲方式减少系统调用次数，代码也更简洁。

标准 I/O 的缓冲分三种模式：

- **全缓冲**（fully buffered）：典型如磁盘文件，缓冲区填满或调用 `fflush` 时才真正写出
- **行缓冲**（line buffered）：典型如连到终端的流，遇到换行符就刷新
- **无缓冲**（unbuffered）：如 `stderr`，每次调用立即写出，保证错误信息第一时间可见

> [!note]
> 这也是"为什么 `printf` 输出有时不会立刻显示在终端上"的常见困惑来源——若标准输出被重定向到文件，缓冲模式会从行缓冲切换为全缓冲，输出要等到缓冲区满或程序退出才写出。

标准 I/O 的缺点：不适合处理网络 socket 上的 I/O；对同一流先输出后输入、或先输入后输出时有额外限制。

## 10.10 综合：我该使用哪些 I/O 函数？

- **优先用标准 I/O**：处理磁盘文件和终端时，标准 I/O 是最直接的选择
- **不要用 `scanf` 或 `rio_readlineb` 读二进制文件**：它们是文本接口，不适合任意字节流
- **对网络 socket 使用 RIO**：网络 I/O 要处理短读、短写和信号中断，RIO 更稳妥

> [!warning]
> 标准 I/O 流并不总能与 socket 兼容：
>
> 1. 不能在不调用 `fflush`、`fseek`、`fsetpos`、`rewind` 的情况下，连续执行"输出后输入"
> 2. 不能在不调用 `fseek`、`fsetpos`、`rewind` 的情况下，连续执行"输入后输出"，除非输入已经到达文件末尾

这些限制使标准 I/O 很难直接用于网络程序。通常的做法是：用 `sprintf` 先格式化字符串，再用 `rio_writen` 发送到 socket；对输入则用 `rio_readlineb` 读取整行，再用 `sscanf` 解析字段。

---

# 第六部分 小结

## 10.11 小结

这一章的核心结论：

1. Linux 把所有 I/O 设备都抽象成文件，统一了读写接口
2. 真正的 Unix I/O 由 `open`、`read`、`write`、`close` 等函数构成，描述符是关键抽象
3. 大多数应用并不直接依赖裸 Unix I/O，而是使用封装层：RIO 或标准 I/O

> [!note]
> 这三层接口不是互相替代，而是逐层抽象：Unix I/O 是最底层的内核接口；RIO 是底层 I/O 的健壮包装；标准 I/O 提供更方便的文本和格式化接口。

内核用三张表表示打开的文件——描述符表（每进程独有）、打开文件表（所有进程共享）、v-node 表（所有进程共享）——共同解释了文件共享和 I/O 重定向的语义：父子进程可以共享相同文件位置，不同描述符也能访问同一文件的不同位置。

标准 I/O 基于 Unix I/O 实现，提供更高层次的缓冲 I/O：对磁盘和终端，它通常是更好的选择；对网络 socket，则更适合使用 RIO。
