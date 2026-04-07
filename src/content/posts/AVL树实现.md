---
title: AVL树实现
published: 2026-04-06
description: '在上一篇博客中，我们实现了一个二叉树的基类，基于此基类，我们将实现一个AVL树，包含AVL树的结构、插入和删除操作，以及平衡调整的方法。'
image: ''
tags: [二叉树, 数据结构, 代码实现]
category: '数据结构'
series: '二叉树'
draft: true 
lang: 'zh_CN'
---
# AVL树
在上一篇博客中，我们实现了一个二叉树的基类，基于此基类，我们将实现一个AVL树，包含AVL树的结构、插入和删除操作，以及平衡调整的方法。
:::warning
**注意**：以下代码仅供参考，实际应用中可能需要根据具体需求进行调整和优化。
:::
## AVL树的代码结构
与二叉树基类类似，AVL树的代码结构也包含一个节点类和一个AVL树类。节点类包含节点的值、左子树和右子树的指针，以及一个平衡因子（balance factor）来表示节点的平衡状态。AVL树类包含根节点和一些操作方法，如插入、删除和旋转等。
但在具体实现中平衡因子的维护比较复杂，所以我使用了一个高度属性来代替平衡因子，一来容易维护，二来平衡因子的计算也容易。
在AVL树类中，我们需要实现以下方法：
- 插入节点：在AVL树中插入一个节点后，需要检查树的平衡状态，并进行必要的旋转操作来保持AVL树的平衡。
- 旋转操作：AVL树的旋转操作包括左旋、右旋、左-右旋和右-左旋，这些操作用于调整树的结构以保持平衡。
## AVL树的具体结构
### AVL树节点类
一个AVL树节点类通常包含以下成员：
- `data`：节点储存的数据，可以是任意类型。
- `left_child`：指向左子树的指针。
- `right_child`：指向右子树的指针。
- `height`：节点的高度，用于计算平衡因子。
- `parent`：（可选）指向父节点的指针，方便在旋转操作中更新节点关系。

和以下方法：
- 获取平衡因子：通过计算左子树和右子树的高度差来获取节点的平衡因子。
- 获取左右子树高度：获取节点的左子树和右子树的高度，方便计算平衡因子。
- 更新高度：在插入或删除节点后，需要更新节点的高度，以便正确计算平衡因子。
- 判断是否平衡：根据平衡因子判断节点是否平衡，如果平衡因子的绝对值大于1，则说明节点不平衡。

还有构造函数、析构函数和比较操作等方法，具体看[二叉树基类实现](/posts/二叉树基类实现/)。
### AVL树类
一个AVL树类通常包含以下成员：
- `root`：指向AVL树根节点的指针。

和以下方法：
- 插入节点：实现一个方法来插入节点，并在插入后检查树的平衡状态，进行必要的旋转操作。
- 旋转操作：实现左旋、右旋、左-右旋和右-左旋等方法，用于调整树的结构以保持平衡。
- 判断是否平衡：实现一个方法来判断AVL树是否平衡，可以通过检查根节点的平衡因子来判断。

还有构造函数、析构函数和查找节点等方法，具体看[二叉树基类实现](/posts/二叉树基类实现/)。
# 具体代码实现
接下来我会逐段讲解AVL树的代码实现。
## AVL树节点类
```cpp title="AVLtree.hpp"
#ifndef AVLTREE_HPP
#define AVLTREE_HPP
#include "binaryTree.hpp"

namespace mystruct
{
    template<typename Data>
    class AVLTreeNode : public treeNode<Data, AVLTreeNode<Data>>
    {
        using BaseNode = treeNode<Data, AVLTreeNode<Data>>;
        template<typename T> friend bool operator<(const AVLTreeNode<T> &lhs, const AVLTreeNode<T> &rhs);
        template<typename T> friend class AVLTree;
    protected:
        AVLTreeNode<Data> *parent;
        int height;
    public:
        AVLTreeNode() = delete;
        explicit AVLTreeNode(const Data& data) : BaseNode(data),  parent(nullptr), height(1) {}
```
在这一段中，我们定义了一个`AVLTreeNode`类，继承自之前定义的`treeNode`类。我们可以看到之前在`treeNode`类中使用了`DerivedNode`来表示派生节点的类型，让代码实现复用。
然后：
- `using`：让我们可以少打点字。
- `friend`：使比较函数和AVL树类能够访问节点的私有成员。

接着，我们定义了`parent`指针和`height`属性来维护AVL树的结构和平衡状态。
最后，我们定义了构造函数，禁止默认构造，并初始化节点的数据、父节点指针和高度。
```cpp title="AVLtree.hpp" startLineNumber=19
        [[nodiscard]] std::pair<int, int> getLRHeight() const
        {
            return std::make_pair(
                BaseNode::left_child ? BaseNode::left_child->height : 0,
                BaseNode::right_child ? BaseNode::right_child->height : 0
                );
        }

        [[nodiscard]] bool is_balanced() const
        {
            auto [left_height, right_height] = getLRHeight();
            int balance = left_height - right_height;
            return balance >= -1 && balance <= 1;
        }

        void update()
        {
            auto [left_height, right_height] = getLRHeight(); //结构化绑定
            height = std::max(left_height, right_height) + 1;
        }

        [[nodiscard]] int getBF() const
        {
            auto [left_height, right_height] = getLRHeight();
            return left_height - right_height;
        }
    };

    template<typename Data>
    bool operator<(const AVLTreeNode<Data> &lhs, const AVLTreeNode<Data> &rhs)
    {
        return lhs.data < rhs.data;
    }
```
在这一段中，我们实现了AVL树节点类的一些方法：
- `getLRHeight()`：获取节点的左子树和右子树的高度，返回一个包含左右子树高度的`std::pair`。
- `is_balanced()`：判断节点是否平衡，通过计算平衡因子来判断，如果平衡因子的绝对值大于1，则说明节点不平衡。
- `update()`：更新节点的高度，通过获取左右子树的高度来计算节点的高度。
- `getBF()`：获取节点的平衡因子，通过计算左右子树的高度差来获取平衡因子。
- `operator<`：用于比较两个AVL树节点的值，方便在AVL树中进行插入和查找操作。

这些函数都比较简单，就不过多赘述了，主要是为了AVL树的插入和旋转操作提供必要的工具函数。
:::note
\[\[nodiscard]]：这是C++17引入的属性，表示函数的返回值不应该被忽略，如果调用者没有使用返回值，编译器会发出警告。这对于一些重要的函数来说非常有用，可以帮助开发者避免一些潜在的错误。不写这个属性也是可以的，但加上后可以提高代码的安全性和可维护性。
:::
## AVL树类
```cpp title="AVLtree.hpp" startLineNumber=52
    template<typename Data>
    class AVLTree : public binaryTree<AVLTreeNode<Data>>
    {
        using BaseTree = binaryTree<AVLTreeNode<Data>>;
        using AVLNode = AVLTreeNode<Data>;
    public:
        AVLTree() : BaseTree() {}
        ~AVLTree() = default;

        [[nodiscard]] bool isBalanced() const
        {
            return this->root ? this->root->is_balanced() : true;
        }
```
在这一段中，我们定义了一个`AVLTree`类，继承自之前定义的`BinaryTree`类。我们使用`using`来简化类型名称。
我们定义了构造函数和析构函数，构造函数调用基类的构造函数来初始化根节点，析构函数使用默认实现，因为基类的析构函数已经负责删除根节点及其子树了。
我们还定义了一个`isBalanced()`方法，用于判断AVL树是否平衡，通过检查根节点的平衡状态来判断。
### 旋转操作
**旋转操作**是AVL树保持**平衡**的关键，我们需要实现**左旋、右旋、左-右旋和右-左旋**等方法来调整树的结构。
#### 左旋
当我们在 AVL 树中插入一个节点后，如果某个节点 `node` 的**平衡因子变为 -2**（即右子树比左子树高 2 层），且其**右孩子的平衡因子为 -1 或 0**（说明是“右右”失衡），则需要进行一次左旋。

![左旋示例](https://pic1.zhimg.com/v2-a7bd0f59e788ea6e9c687cbe2834027e_b.webp)
操作是：
1. 将 `node` 的右节点更新为其右孩子的左孩子 `right_left_child`。
2. 将 `right_left_child` 的父节点更新为 `node`。
3. 将 `node` 的右孩子 `right_child` 的左节点更新为 `node`。
4. 将 `node` 的父节点 `parent` 更新为 `right_child`。
5. 将 `parent` 和 `right_child` 进行连接。

代码实现如下：
```cpp title="AVLtree.hpp" startLineNumber=65
        void LeftRotate(AVLNode *node)
        {
            AVLNode *parent = node->parent;
            AVLNode *right_child = node->right_child;
            AVLNode *right_left_child = right_child->left_child;
            //第一步
            node->right_child = right_left_child;
            //第二步
            if (right_left_child)
                right_left_child->parent = node;
            //第三步
            right_child->left_child = node;
            //第四步
            if (parent)//如果存在父节点，将父节点的子节点指向right_child
            {
                if (parent->left_child == node)
                    parent->left_child = right_child;

                else
                    parent->right_child = right_child;
            }
            else
            {
                this->root = right_child;
            }
            //第五步
            right_child->parent = parent;
            node->parent = right_child;
            //更新高度
            node->update();
            right_child->update();
        }
```
#### 右旋
当某个节点 `node` 的**平衡因子变为 2**（即左子树比右子树高 2 层），且其**左孩子的平衡因子为 1 或 0**（说明是“左左”失衡），则需要进行一次右旋。

![右旋示例](https://pic2.zhimg.com/v2-9a04996731baf62ca3141e730a4bc185_b.webp)
操作是：
1. 将 `node` 的左节点更新为其左孩子的右孩子 `left_right_child`。
2. 将 `left_right_child` 的父节点更新为 `node`。
3. 将 `node` 的左孩子 `left_child` 的右节点更新为 `node`。
4. 将 `node` 的父节点 `parent` 更新为 `left_child`。
5. 将 `parent` 和 `left_child` 进行连接。

代码实现如下：
```cpp title="AVLtree.hpp" startLineNumber=97
        void RightRotate(AVLNode *node)
        {
            AVLNode *parent = node->parent;
            AVLNode *left_child = node->left_child;
            AVLNode *left_right_child = left_child->right_child;
            node->left_child = left_right_child;
            if (left_right_child)
                left_right_child->parent = node;

            left_child->right_child = node;
            if (parent)
            {
                if (parent->right_child == node)
                    parent->right_child = left_child;

                else
                    parent->left_child = left_child;
            }
            else
            {
                this->root = left_child;
            }
            left_child->parent = parent;
            node->parent = left_child;
            node->update();
            left_child->update();
        }
```
#### 左-右旋和右-左旋
这些是**双旋**操作，用于处理子节点与父节点“折线”方向失衡的情况。

- **左-右旋 (LR Rotate)**：当某个节点的平衡因子变为 **2**，且其**左孩子的平衡因子为 -1**（说明左子树的右侧过高，即“左右”失衡）时触发。先对左子节点进行左旋将其转为“左左”失衡，然后再对当前节点进行右旋。
- **右-左旋 (RL Rotate)**：当某个节点的平衡因子变为 **-2**，且其**右孩子的平衡因子为 1**（说明右子树的左侧过高，即“右左”失衡）时触发。先对右子节点进行右旋将其转为“右右”失衡，然后再对当前节点进行左旋。

代码实现如下：
```cpp title="AVLtree.hpp" startLineNumber=124
        void LeftRightRotate(AVLNode *node)
        {
            RightRotate(node->left_child);
            LeftRotate(node);
        }

        void RightLeftRotate(AVLNode *node)
        {
            LeftRotate(node->right_child);
            RightRotate(node);
        }
```
### 插入节点
在AVL树中插入一个节点后，需要检查树的平衡状态，并进行必要的旋转操作来保持AVL树的平衡。插入节点的过程与普通二叉树类似，但在插入后需要进行平衡调整。
代码实现如下：
```cpp title="AVLtree.hpp" startLineNumber=135
        bool insert(const Data &data)
        {
            //如果是第一次插入，直接将根节点设置为新节点
            if (!this->root)
            {
                this->root = new AVLNode(data);
                return true;
            }

            //开始插入节点，逐个比较，找到合适的位置插入新节点，并记录父节点
            AVLNode *current = this->root;
            AVLNode *parent = nullptr;
            while (current)
            {
                if (current->data == data) return false;
                parent = current;
                if (data < current->data)
                    current = current->left_child;
                else
                    current = current->right_child;
            }

            //current此时已经到达了插入位置，将新节点插入到parent的左子树或右子树
            current = new AVLNode(data);
            current->parent = parent;
            if (data < parent->data)
                parent->left_child = current;
            else
                parent->right_child = current;

            // 向上回溯：更新高度并检查平衡
            AVLNode *temp = parent;
            while (temp)
            {
                temp->update();
                //到达最小不平衡子树，进行旋转调整
                if (!temp->is_balanced())
                {
                    if (temp->getBF() > 1)
                    {
                        if (data < temp->left_child->data)
                            RightRotate(temp);
                        else
                            LeftRightRotate(temp);
                    }
                    else
                    {
                        if (data > temp->right_child->data)
                            LeftRotate(temp);
                        else
                            RightLeftRotate(temp);
                    }
                    return true; // AVL树插入并旋转后即达到全局平衡
                }
                temp = temp->parent;
            }
            //如果没有找到不平衡的节点，说明AVL树已经保持平衡，直接返回true
            return true;
        }
    };
}
#endif
```
# 结语
以上是AVL树的基本实现，包括节点类、树类以及插入和旋转操作。其中旋转操作可能比较复杂，理清楚旋转的步骤和逻辑对于理解AVL树的平衡调整非常重要。
AVL树的删除操作相对复杂，涉及到更多的情况和调整，后续有机会再更新这部分内容。
# 参考资料
- [AVL树 - Wikipedia](https://en.wikipedia.org/wiki/AVL_tree)
- [史上最详细的AVL树的实现(万字+动图讲解旋转)](https://zhuanlan.zhihu.com/p/676233161)

本篇图片同样来自[史上最详细的AVL树的实现(万字+动图讲解旋转)](https://zhuanlan.zhihu.com/p/676233161)，感谢原作者的分享。