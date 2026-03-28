// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BountylaneEscrow
 * @notice Simple escrow contract for Bountylane marketplace
 * @dev Requester deposits MON, platform releases to worker on task completion
 */
contract BountylaneEscrow {
    address public owner;
    
    enum TaskStatus { Open, Accepted, Submitted, Done, Cancelled }
    
    struct Task {
        string taskId;           // Off-chain task ID (from platform)
        address requester;       // Who created the task
        address worker;          // Who accepted the task (0x0 if none)
        uint256 reward;          // Amount in wei
        TaskStatus status;
        string result;           // Worker's submitted result (IPFS hash or JSON)
    }
    
    // taskId => Task
    mapping(string => Task) public tasks;
    
    // Events for frontend to track
    event TaskCreated(string indexed taskId, address indexed requester, uint256 reward);
    event TaskAccepted(string indexed taskId, address indexed worker);
    event TaskSubmitted(string indexed taskId, string result);
    event TaskCompleted(string indexed taskId, address indexed worker, uint256 payout);
    event TaskCancelled(string indexed taskId, address indexed requester, uint256 refund);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    /**
     * @notice Requester creates a task by depositing MON as escrow
     * @param taskId Unique task ID from the platform
     */
    function createTask(string calldata taskId) external payable {
        require(msg.value > 0, "Must send MON as reward");
        require(tasks[taskId].reward == 0, "Task already exists");
        
        tasks[taskId] = Task({
            taskId: taskId,
            requester: msg.sender,
            worker: address(0),
            reward: msg.value,
            status: TaskStatus.Open,
            result: ""
        });
        
        emit TaskCreated(taskId, msg.sender, msg.value);
    }
    
    /**
     * @notice Worker accepts an open task
     * @param taskId The task to accept
     */
    function acceptTask(string calldata taskId) external {
        Task storage task = tasks[taskId];
        require(task.reward > 0, "Task does not exist");
        require(task.status == TaskStatus.Open, "Task not open");
        // Note: In production, uncomment this to prevent self-accept
        // require(task.requester != msg.sender, "Cannot accept own task");
        
        task.worker = msg.sender;
        task.status = TaskStatus.Accepted;
        
        emit TaskAccepted(taskId, msg.sender);
    }
    
    /**
     * @notice Worker submits result for the task
     * @param taskId The task ID
     * @param result The result (could be IPFS hash, JSON string, etc.)
     */
    function submitTask(string calldata taskId, string calldata result) external {
        Task storage task = tasks[taskId];
        require(task.reward > 0, "Task does not exist");
        require(task.status == TaskStatus.Accepted, "Task not accepted");
        require(task.worker == msg.sender, "Only assigned worker");
        
        task.result = result;
        task.status = TaskStatus.Submitted;
        
        emit TaskSubmitted(taskId, result);
    }
    
    /**
     * @notice Platform owner releases payment to worker
     * @param taskId The task to complete
     */
    function releasePayout(string calldata taskId) external onlyOwner {
        Task storage task = tasks[taskId];
        require(task.reward > 0, "Task does not exist");
        require(task.status == TaskStatus.Submitted, "Task not submitted");
        require(task.worker != address(0), "No worker assigned");
        
        uint256 payout = task.reward;
        address worker = task.worker;
        
        task.status = TaskStatus.Done;
        
        // Transfer MON to worker
        (bool success, ) = payable(worker).call{value: payout}("");
        require(success, "Payout failed");
        
        emit TaskCompleted(taskId, worker, payout);
    }
    
    /**
     * @notice Requester cancels an open task and gets refund
     * @param taskId The task to cancel
     */
    function cancelTask(string calldata taskId) external {
        Task storage task = tasks[taskId];
        require(task.reward > 0, "Task does not exist");
        require(task.requester == msg.sender, "Only requester");
        require(task.status == TaskStatus.Open, "Can only cancel open tasks");
        
        uint256 refund = task.reward;
        task.status = TaskStatus.Cancelled;
        task.reward = 0;
        
        (bool success, ) = payable(msg.sender).call{value: refund}("");
        require(success, "Refund failed");
        
        emit TaskCancelled(taskId, msg.sender, refund);
    }
    
    /**
     * @notice Get task details
     */
    function getTask(string calldata taskId) external view returns (
        address requester,
        address worker,
        uint256 reward,
        TaskStatus status,
        string memory result
    ) {
        Task storage task = tasks[taskId];
        return (task.requester, task.worker, task.reward, task.status, task.result);
    }
    
    /**
     * @notice Get contract balance (total escrowed MON)
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * @notice Transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}
