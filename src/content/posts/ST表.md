---
title: ST表
published: 2026-03-31
description: 'ST表的使用心得'
image: ''
tags: [ST表, 数据结构]
category: '数据结构'
draft: false 
lang: ''
---
最近写洛谷[P7167](https://www.luogu.com.cn/problem/P7167)的时候，用单调栈发现TLE了，然后学习了ST表，想着记录一些ST的使用方法。
# ST表简介
ST 表（Sparse Table，稀疏表）是一种用于在**静态数组**上进行快速查询的数据结构，特别适用于 idempotent operations（幂等操作），如最小值、最大值、最大公约数等。ST 表的构建时间复杂度为 $O(n \log n)$，查询时间复杂度为 $O(1)$，空间复杂度为 $O(n \log n)$。
# ST表的使用场景
ST表往往用于可以动态规划且需要频繁区间查询的场景。
## 区间查询
ST表最常见的使用场景是区间查询，特别是当需要频繁查询某个区间的最小值、最大值或其他幂等操作时。由于ST表可以在$O(1)$时间内返回查询结果，因此非常适合处理大量查询的情况。
## 状态转移
在某些动态规划问题中，可能不能实现幂等操作，这时，ST表可以通过倍增来优化状态转移过程，达到快速查询的效果。例如P7167中需要频繁查看圆盘的容量并累加，这时可以使用ST表来快速查询从某个圆盘开始一定范围内的总容量。
其实此时已经跟ST表关系不大了，主要是用ST表实现倍增。
# ST表的构建和查询
## 构建
构建ST表的过程主要包括以下步骤：
1. 初始化：创建一个二维数组 `st`，其中 `st[i][j]` 表示以 `i` 为起点，长度为 $2^j$ 的区间的查询结果。
2. 填充：使用动态规划的方式填充 `st` 数组，利用之前计算的结果来构建更长的区间。
   状态转移方程通常为：
   ```
   st[i][j] = operation(st[i][j - 1], st[i + 2^(j - 1)][j - 1]);
   ```
   其中 `operation` 是你需要进行的幂等操作，如最小值或最大值。
## 查询
查询过程非常简单，给定一个区间 `[L, R]`，首先计算区间长度 `k = floor(log2(R - L + 1))`，然后使用预先计算好的 `st` 数组来返回查询结果，通常是通过合并两个重叠区间的结果或倍增合并不重叠区间来得到最终答案。
例如：
1. 若满足幂等操作，可以直接返回 `operation(st[L][k], st[R - 2^k + 1][k])`。
2. 若不满足幂等操作，可以通过倍增的方式合并多个区间的结果来得到最终答案。
   ```
   result = initial_value;
   for(int k = floor(log2(R - L + 1)); k >= 0; k--){
       if ((R - L + 1) >= 2^k){
        result = operation(result, st[L][k]);
        L += 2^k;
        // 这里不一定要有R，因为不满足幂等操作，所以R只是用来代表终止条件
        // L的位置转移不一定是连续的，所以需要根据实际情况来调整L的位置
       }
    }
   ```
# 案例
## gcd查询
假设我们需要在一个数组中频繁查询某个区间的最大公约数（gcd）。我们可以使用ST表来预处理数组，使得每次查询都能在$O(1)$时间内返回结果。
1. 构建ST表：对于每个元素，初始化 `st[i][0]` 为该元素的值。然后使用动态规划填充 `st` 数组，根据状态转移方程计算更长区间的gcd。
2. 查询：对于每个查询区间 `[L, R]`，计算 `k = floor(log2(R - L + 1))`，然后返回 `gcd(st[L][k], st[R - 2^k + 1][k])`。

下面是一个简单的示例代码片段，展示了如何构建和查询ST表以进行gcd查询：

```cpp
#include <iostream>
#include <vector>
#include <cmath> // 包含 std::log2
#include <numeric> // 包含 std::gcd (C++17)
using namespace std;
const int MAXN = 100005; // 稍微开大一点防止越界
int st[MAXN][20]; // 假设最大数组长度为100000，20是因为20 > log2(100000) 
// st[L][k] 表示从 L 开始，长度为 2^k 的区间的 gcd 结果，即覆盖 [L, L + 2^k - 1]

void buildST(const vector<int>& arr, int n) {
    for (int i = 0; i < n; i++) {
        st[i][0] = arr[i];
    }
    for (int j = 1; (1 << j) <= n; j++) {
        for (int i = 0; i + (1 << j) - 1 < n; i++) {
            st[i][j] = std::gcd(st[i][j - 1], st[i + (1 << (j - 1))][j - 1]);
        }
    }
}

int query(int L, int R) {
    int k = std::log2(R - L + 1);

    // st[R - (1 << k) + 1][k] 表示以 R 结尾，长度为 2^k 的区间的 gcd 结果，即覆盖 [R - 2^k + 1, R]
    // 因为 gcd 是幂等操作（重叠区间不影响结果），合并两部分即可覆盖整个区间 [L, R]
    return std::gcd(st[L][k], st[R - (1 << k) + 1][k]);
}

int main() {
    int n, q;
    cin >> n >> q;
    vector<int> arr(n);
    for (int i = 0; i < n; i++) {
        cin >> arr[i];
    }
    buildST(arr, n);
    while (q--) {
        int L, R;
        cin >> L >> R;
        cout << query(L, R) << "\n";
    }
    return 0;
}
```
## P7167
在洛谷P7167中，我们需要处理大量的查询，查询内容涉及到圆盘的容量和累加。通过使用ST表，我们可以快速查询从某个圆盘开始一定范围内的总容量，从而显著提高查询效率。具体实现时，可以将圆盘的容量预处理到ST表中，然后根据查询需求进行快速查询和累加。

下面是一个示例代码片段，展示了如何使用ST表来处理P7167中的查询：

```cpp
#include <iostream>
using namespace std;

const int MAXN = 100005;
int D[MAXN], C[MAXN];   // D[i]：第 i 个圆盘的直径，C[i]：第 i 个圆盘的容量
int nxt[MAXN][20];      // nxt[i][j] (next)：表示从圆盘 i 溢出后，向下跳跃 2^j 次最终到达的圆盘编号
int sum[MAXN][20];      // sum[i][j]：从圆盘 i 溢出后，向下跳跃 2^j 次路径上所有圆盘的容量累加和
int stk[MAXN], top = 0; // 单调栈及栈顶索引，用于寻找下方第一个直径更大的圆盘。

int main() {
    
    int n, q;
    cin >> n >> q;
    
    for (int i = 1; i <= n; i++) {
        cin >> D[i] >> C[i];
    }
    
    // 单调栈，寻找每个圆盘水流溢出后的下一个目标圆盘，作为倍增表的第一列，并记录第一列的容量累加和
    for (int i = 1; i <= n; i++) {
        while (top > 0 && D[stk[top]] < D[i]) {
            nxt[stk[top]][0] = i;
            sum[stk[top]][0] = C[stk[top]];
            top--;
        }
        stk[++top] = i;
    }
    
    // 剩下的圆盘没有下方满足条件的圆盘，最终流向水池(虚设为0)
    while (top > 0) {
        nxt[stk[top]][0] = 0;
        sum[stk[top]][0] = C[stk[top]];
        top--;
    }
    
    // 构建倍增表 (ST表的变种体现)
    for (int j = 1; j <= 18; j++) {
        for (int i = 1; i <= n; i++) {
            nxt[i][j] = nxt[nxt[i][j - 1]][j - 1];
            sum[i][j] = sum[i][j - 1] + sum[nxt[i][j - 1]][j - 1];
        }
    }
    
    // 处理查询
    while (q--) {
        int R, V;
        cin >> R >> V;
        int curr = R;
        
        // 倍增跳跃寻找水流的终点
        for (int j = 18; j >= 0; j--) {
            if (nxt[curr][j] != 0 && sum[curr][j] < V) {
                V -= sum[curr][j];
                curr = nxt[curr][j];
            }
        }
        
        // 经过最大的跳跃后，如果剩余水容量仍超出当前盘的容量，说明会最终流入水池
        if (V <= C[curr]) cout << curr << '\n';
        else cout << 0 << '\n';
    }
    
    return 0;
}
```

# 结论
ST表是一种非常高效的数据结构，适用于需要频繁进行区间查询的场景。通过合理地构建和使用ST表，可以显著提高查询效率，尤其是在处理大量查询时。对于需要快速查询区间最小值、最大值或其他幂等操作的问题，ST表是一个非常值得考虑的选择。
