---
title: 第十章 系统级I/O
published: 2026-09-08
description: "Unix I/O 模型、基本文件操作、健壮 I/O 与元数据"
image: ""
tags: [计算机原理]
category: "计算机基础"
series: "CSAPP"
draft: false
lang: "zh_CN"
---

输入/输出（I/O）是在主存和外部设备（例如磁盘驱动器、终端和网络）之间复制数据的过程。输入操作是从 I/O 设备复制数据到主存，而输出操作是从主存复制数据到 I/O 设备。

> [!important] 理解Unix I/O模型的重要性
> 尽管多数语言都提供了标准 I/O 库，但理解 Unix I/O 模型仍然很重要：
>
> - 它是理解进程、文件共享、虚拟内存和网络编程的基础
> - 高级接口有时无法满足需求（如元数据访问）
>   - 标准 I/O 非异步信号安全（信号处理中只能用 `write` 等）
>   - 网络编程必须正确处理短读、短写和 EOF。

---

# 第一部分 Unix I/O 模型

## 10.1 Unix I/O

一个 Linux 文件就是一个长度为 $m$ 的字节序列：

$$
B_0, B_1, \dots, B_k, \dots, B_{m-1}
$$

所有的 I/O 设备（例如网络、磁盘和终端）都被模型化为文件，而所有的输入和输出都被当作对相应文件的读和写来执行。

这种将设备优雅地映射为文件的方式，允许 Linux 内核引出一个简单、低级的应用接口，称为 **Unix I/O**，这使得所有的输入和输出都能以一种统一且一致的方式来执行：

- **打开文件**：打开文件后，内核会返回一个小的非负整数：**文件描述符**（file descriptor）。它是后续读写操作的句柄。
- 每个进程启动时，内核都会自动打开三个文件：
  1. **标准输入**，描述符`STDIN_FILENO`(0)
  2. **标准输出**，描述符`STDOUT_FILENO`(1)
  3. **标准错误**，描述符`STDERR_FILENO`(2)
- 改变当前文件位置：对于每个打开的文件，内核保持着一个文件位置 $k$，初始为 $0$。这个文件位置是从文件开头起始的字节偏移量。应用程序能够通过执行 `seek` 操作，显式地设置文件的当前位置为 $k$。
- 读写文件：一个读（写）操作就是从文件（内存）复制 $n > 0$ 个字节到内存（文件）。
  - 当前文件位置 $k$ 指向下一个要读或写的字节。初始化为 $0$，每次读写 $n$ 个字节后，$k= k+n$
  - 给定一个大小为 $m$ 字节的文件，当 $k\ge m$ 时执行读操作会触发一个称为 end-of-file（EOF）的条件，应用程序能检测到这个条件。
    - 在文件结尾处并没有明确的 “EOF 符号”。
- 关闭文件：内核释放文件打开时创建的数据结构，并将这个描述符恢复到可用的描述符池中。

> [!warning]
> 这里的 $n$ 为实际读写的字节数，而非请求的字节数。在常见情形：短读、短写发生时（见 [§10.3](#104-读和写文件)）二者相等。

---

# 第二部分 基本文件操作

## 10.2 文件

每个 Linux 文件都有一个**类型**（type）来表明它在系统中的角色：

- **普通文件**（regular file）包含任意数据。应用程序常常要区分**文本文件**（text file）和**二进制文件**（binary file），文本文件是只含有 ASCII 或 Unicode 字符的普通文件；二进制文件是所有其他的文件。对内核而言，文本文件和二进制文件没有区别。

  Linux 文本文件包含了一个**文本行**（text line）序列，其中每一行都是一个字符序列，以一个新行符（“\n”）结束。新行符与 ASCII 的换行符（LF）是一样的，其数字值为 0x0a。

- **目录**（directory）是包含一组**链接**（link）的文件，其中每个链接都将一个**文件名**（filename）映射到一个文件，这个文件可能是另一个目录。每个目录至少含有两个条目：是到该目录自身的链接，以及是到目录层次结构（见下文）中**父目录**（parent directory）的链接。你可以用 mkdir 命令创建一个目录，用 Is 查看其内容，用 rmdir 删除该目录。
- **套接字**（socket）是用来与另一个进程进行跨网络通信的文件（11.4 节）。

其他文件类型包含**命名通道**（named pipe）、 **符号链接**（symbolic link），以及**字符和块设备**（character and block device），这些不在本书的讨论范畴。

Linux 内核将所有文件都组织成一个**目录层次结构**（directory hierarchy），由名为 /（斜杠）的**根目录**确定。系统中的每个文件都是根目录的直接或间接的后代。图 10-1 显示了 Linux 系统的目录层次结构的一部分。

作为其上下文的一部分，每个进程都有一个**当前工作目录**（current working directory）来确定其在目录层次结构中的当前位置。你可以用 cd 命令来修改 shell 中的当前工作目录。

目录层次结构中的位置用**路径名**（pathname）来指定。路径名是一个字符串，包括一个可选斜杠，其后紧跟一系列的文件名，文件名之间用斜杠分隔。路径名有两种形式：

- **绝对路径名**（absolute pathname）以一个斜杠开始，表示从根节点开始的路径。例如，在图 10-1 中，hello.c 的绝对路径名为 **/home/droh/hello.c**。
- **相对路径名**（relative pathname）以文件名开始，表示从当前工作目录开始的路径。例如，在图 10-1 中，如果 **/home/droh** 是当前工作目录，那么 **hello.c** 的相对路径名就是 **./hello.c**。反之，如果 **/home/bryant** 是当前工作目录，那么相对路径名就是 **../home/droh/hello.c**。

## 10.3 打开和关闭文件

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

## 10.4 读和写文件

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

## 10.5 用 RIO 包健壮地读写

**RIO**（Robust I/O，健壮 I/O）自动处理短计数，提供两类函数：

- **无缓冲的 I/O**：`rio_readn`、`rio_writen`——直接反复调用底层 `read`/`write`
- **带缓冲的 I/O**：`rio_readlineb`、`rio_readnb`——通过内部缓冲区读取

> [!tip]
> 如果要写网络程序，RIO 是更稳妥的选择，它隐藏了很多短读、短写和信号中断的细节。

### 10.5.1 RIO 的无缓冲 I/O

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

### 10.5.2 RIO 的带缓冲输入函数

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

## 10.6 读取文件元数据

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

## 10.7 读取目录内容

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

## 10.8 共享文件

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

## 10.9 I/O 重定向

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

## 10.10 标准 I/O

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

## 10.11 综合：我该使用哪些 I/O 函数？

- **优先用标准 I/O**：处理磁盘文件和终端时，标准 I/O 是最直接的选择
- **不要用 `scanf` 或 `rio_readlineb` 读二进制文件**：它们是文本接口，不适合任意字节流
- **对网络 socket 使用 RIO**：网络 I/O 要处理短读、短写和信号中断，RIO 更稳妥

> [!warning]
> 标准 I/O 流并不总能与 socket 兼容：
>
> 1. 不能在不调用 `fflush`、`fseek`、`fsetpos`、`rewind` 的情况下，连续执行"输出后输入"
> 2. 不能在不调用 `fseek`、`fsetpos`、`rewind` 的情况下，连续执行"输入后输出"，除非输入已经到达文件末尾

这些限制使标准 I/O 很难直接用于网络程序。通常的做法是：用 `sprintf` 先格式化字符串，再用 `rio_writen` 发送到 socket；对输入则用 `rio_readlineb` 读取整行，再用 `sscanf` 解析字段。
