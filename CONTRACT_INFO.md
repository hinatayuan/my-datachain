# 合约使用说明

## 功能介绍

我已经为你实现了完整的合约日志查询功能，包含：

### 1. 合约调用功能
- **合约调用** Tab页面
- 输入合约地址、姓名和年龄
- 调用 `setInfo` 函数设置信息
- 自动等待交易确认

### 2. The Graph日志查询
- 通过 The Graph 子图查询 `Instructor` 事件日志
- 实时显示链上合约调用记录
- 包含交易哈希、区块号、时间戳、参数等信息

### 3. 界面功能
- Tab切换：转账方式 ⟷ 合约调用
- 实时余额显示
- 多网络支持
- 响应式设计

## 使用步骤

1. **连接钱包**
   - 点击右上角"钱包地址"按钮
   - 连接 MetaMask 钱包

2. **切换到合约调用**
   - 点击"合约调用" Tab

3. **填写合约信息**
   - 合约地址：你的 InfoContract 部署地址
   - 姓名：要设置的姓名
   - 年龄：要设置的年龄

4. **调用合约**
   - 点击"调用合约"按钮
   - 在 MetaMask 中确认交易

5. **查看日志**
   - 调用成功后，日志会自动从 The Graph 获取
   - 或手动点击"刷新日志"按钮

## GraphQL查询结构

当前使用的 GraphQL 查询：

```graphql
query GetInstructorEvents($first: Int = 10) {
  instructorEvents(first: $first, orderBy: blockTimestamp, orderDirection: desc) {
    id
    transactionHash
    blockNumber
    blockTimestamp
    name
    age
    from
  }
}
```

## 合约ABI
使用的是项目中的 `InfoContract.json`，包含：
- `setInfo(string _name, uint256 _age)` - 设置信息
- `getInfo()` - 获取当前信息
- `Instructor` 事件 - 记录设置的信息

## 已实现的功能特性

✅ 合约函数调用
✅ 实时交易状态
✅ The Graph 日志查询
✅ 响应式UI设计
✅ 多网络支持
✅ 错误处理
✅ 加载状态显示

现在你可以使用这个系统来调用合约并查看链上日志记录了！