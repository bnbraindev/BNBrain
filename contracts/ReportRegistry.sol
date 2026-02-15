// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ReportRegistry
 * @notice On-chain registry for BNBrain security report hashes.
 *         Provides tamper-proof proof that a security scan was performed.
 */
contract ReportRegistry {
    struct Report {
        address reporter;
        address target;       // Token or address that was scanned
        bytes32 reportHash;   // keccak256 of the JSON report
        uint256 timestamp;
        string  reportType;   // "token_security" | "address_analysis" | "wallet_health"
    }

    Report[] public reports;

    mapping(bytes32 => bool) public hashExists;

    event ReportStored(
        uint256 indexed reportId,
        address indexed reporter,
        address indexed target,
        bytes32 reportHash,
        string  reportType
    );

    /**
     * @notice Store a security report hash on-chain.
     * @param target The address that was scanned
     * @param reportHash keccak256 hash of the full report JSON
     * @param reportType Type identifier for the report
     * @return reportId The sequential ID of the stored report
     */
    function storeReport(
        address target,
        bytes32 reportHash,
        string calldata reportType
    ) external returns (uint256 reportId) {
        require(reportHash != bytes32(0), "Empty hash");
        require(!hashExists[reportHash], "Duplicate report");

        reportId = reports.length;
        reports.push(Report({
            reporter: msg.sender,
            target: target,
            reportHash: reportHash,
            timestamp: block.timestamp,
            reportType: reportType
        }));

        hashExists[reportHash] = true;

        emit ReportStored(reportId, msg.sender, target, reportHash, reportType);
    }

    /**
     * @notice Verify that a report hash exists on-chain.
     */
    function verifyReport(bytes32 reportHash) external view returns (bool) {
        return hashExists[reportHash];
    }

    /**
     * @notice Get total number of stored reports.
     */
    function totalReports() external view returns (uint256) {
        return reports.length;
    }

    /**
     * @notice Get a report by ID.
     */
    function getReport(uint256 reportId) external view returns (Report memory) {
        require(reportId < reports.length, "Report not found");
        return reports[reportId];
    }
}
