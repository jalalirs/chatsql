-- Create Test Database for ChatSQL
-- This script creates a sample HR database with employees, departments, and projects

-- Create the database
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'TestHRDB')
BEGIN
    CREATE DATABASE TestHRDB;
END
GO

USE TestHRDB;
GO

-- Drop tables if they exist (for clean re-runs)
IF OBJECT_ID('dbo.ProjectAssignments', 'U') IS NOT NULL DROP TABLE dbo.ProjectAssignments;
IF OBJECT_ID('dbo.Projects', 'U') IS NOT NULL DROP TABLE dbo.Projects;
IF OBJECT_ID('dbo.Employees', 'U') IS NOT NULL DROP TABLE dbo.Employees;
IF OBJECT_ID('dbo.Departments', 'U') IS NOT NULL DROP TABLE dbo.Departments;
GO

-- Create Departments table
CREATE TABLE Departments (
    DepartmentID INT PRIMARY KEY IDENTITY(1,1),
    DepartmentName VARCHAR(100) NOT NULL,
    Location VARCHAR(100),
    Budget DECIMAL(15,2),
    CreatedAt DATETIME DEFAULT GETDATE()
);
GO

-- Create Employees table
CREATE TABLE Employees (
    EmployeeID INT PRIMARY KEY IDENTITY(1,1),
    FirstName VARCHAR(50) NOT NULL,
    LastName VARCHAR(50) NOT NULL,
    Email VARCHAR(100) UNIQUE,
    Phone VARCHAR(20),
    HireDate DATE NOT NULL,
    JobTitle VARCHAR(100),
    Salary DECIMAL(10,2),
    DepartmentID INT FOREIGN KEY REFERENCES Departments(DepartmentID),
    ManagerID INT NULL,
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME DEFAULT GETDATE()
);
GO

-- Create Projects table
CREATE TABLE Projects (
    ProjectID INT PRIMARY KEY IDENTITY(1,1),
    ProjectName VARCHAR(200) NOT NULL,
    Description TEXT,
    StartDate DATE,
    EndDate DATE,
    Budget DECIMAL(15,2),
    Status VARCHAR(50) DEFAULT 'Active',
    DepartmentID INT FOREIGN KEY REFERENCES Departments(DepartmentID),
    CreatedAt DATETIME DEFAULT GETDATE()
);
GO

-- Create ProjectAssignments table (many-to-many relationship)
CREATE TABLE ProjectAssignments (
    AssignmentID INT PRIMARY KEY IDENTITY(1,1),
    EmployeeID INT FOREIGN KEY REFERENCES Employees(EmployeeID),
    ProjectID INT FOREIGN KEY REFERENCES Projects(ProjectID),
    Role VARCHAR(100),
    HoursAllocated INT,
    AssignedDate DATE DEFAULT GETDATE()
);
GO

-- Insert Departments
INSERT INTO Departments (DepartmentName, Location, Budget) VALUES
('Engineering', 'Building A - Floor 3', 2500000.00),
('Marketing', 'Building B - Floor 1', 1200000.00),
('Sales', 'Building B - Floor 2', 1800000.00),
('Human Resources', 'Building A - Floor 1', 800000.00),
('Finance', 'Building A - Floor 2', 950000.00),
('Operations', 'Building C - Floor 1', 1500000.00),
('Research & Development', 'Building D - Floor 1', 3000000.00),
('Customer Support', 'Building B - Floor 3', 600000.00);
GO

-- Insert Employees
INSERT INTO Employees (FirstName, LastName, Email, Phone, HireDate, JobTitle, Salary, DepartmentID, ManagerID, IsActive) VALUES
-- Engineering Department (ID: 1)
('John', 'Smith', 'john.smith@company.com', '555-0101', '2020-03-15', 'Senior Software Engineer', 125000.00, 1, NULL, 1),
('Sarah', 'Johnson', 'sarah.johnson@company.com', '555-0102', '2021-06-01', 'Software Engineer', 95000.00, 1, 1, 1),
('Michael', 'Chen', 'michael.chen@company.com', '555-0103', '2022-01-10', 'Junior Developer', 72000.00, 1, 1, 1),
('Emily', 'Davis', 'emily.davis@company.com', '555-0104', '2019-08-20', 'Tech Lead', 145000.00, 1, NULL, 1),
('David', 'Wilson', 'david.wilson@company.com', '555-0105', '2023-02-14', 'DevOps Engineer', 110000.00, 1, 4, 1),
-- Marketing Department (ID: 2)
('Jessica', 'Brown', 'jessica.brown@company.com', '555-0201', '2020-11-05', 'Marketing Director', 135000.00, 2, NULL, 1),
('Ryan', 'Martinez', 'ryan.martinez@company.com', '555-0202', '2021-09-12', 'Marketing Specialist', 68000.00, 2, 6, 1),
('Amanda', 'Taylor', 'amanda.taylor@company.com', '555-0203', '2022-04-25', 'Content Writer', 55000.00, 2, 6, 1),
-- Sales Department (ID: 3)
('Christopher', 'Anderson', 'chris.anderson@company.com', '555-0301', '2019-05-10', 'Sales Manager', 120000.00, 3, NULL, 1),
('Michelle', 'Thomas', 'michelle.thomas@company.com', '555-0302', '2020-07-22', 'Account Executive', 85000.00, 3, 9, 1),
('James', 'Jackson', 'james.jackson@company.com', '555-0303', '2021-03-08', 'Sales Representative', 62000.00, 3, 9, 1),
('Laura', 'White', 'laura.white@company.com', '555-0304', '2022-08-15', 'Sales Representative', 58000.00, 3, 9, 1),
-- Human Resources (ID: 4)
('Jennifer', 'Harris', 'jennifer.harris@company.com', '555-0401', '2018-12-01', 'HR Director', 115000.00, 4, NULL, 1),
('Robert', 'Martin', 'robert.martin@company.com', '555-0402', '2021-01-20', 'HR Specialist', 65000.00, 4, 13, 1),
-- Finance (ID: 5)
('Daniel', 'Garcia', 'daniel.garcia@company.com', '555-0501', '2019-09-15', 'Finance Manager', 125000.00, 5, NULL, 1),
('Ashley', 'Robinson', 'ashley.robinson@company.com', '555-0502', '2020-06-10', 'Senior Accountant', 85000.00, 5, 15, 1),
('Kevin', 'Lee', 'kevin.lee@company.com', '555-0503', '2022-11-28', 'Junior Accountant', 55000.00, 5, 15, 1),
-- Operations (ID: 6)
('Patricia', 'Clark', 'patricia.clark@company.com', '555-0601', '2020-02-28', 'Operations Manager', 105000.00, 6, NULL, 1),
('Steven', 'Lewis', 'steven.lewis@company.com', '555-0602', '2021-07-14', 'Operations Analyst', 72000.00, 6, 18, 1),
-- R&D (ID: 7)
('Elizabeth', 'Walker', 'elizabeth.walker@company.com', '555-0701', '2019-04-05', 'R&D Director', 155000.00, 7, NULL, 1),
('William', 'Hall', 'william.hall@company.com', '555-0702', '2020-10-18', 'Research Scientist', 115000.00, 7, 20, 1),
('Samantha', 'Allen', 'samantha.allen@company.com', '555-0703', '2022-03-22', 'Research Associate', 78000.00, 7, 20, 1),
-- Customer Support (ID: 8)
('Brian', 'Young', 'brian.young@company.com', '555-0801', '2021-05-30', 'Support Manager', 85000.00, 8, NULL, 1),
('Nicole', 'King', 'nicole.king@company.com', '555-0802', '2022-09-05', 'Support Specialist', 48000.00, 8, 23, 1),
('Andrew', 'Wright', 'andrew.wright@company.com', '555-0803', '2023-01-15', 'Support Specialist', 45000.00, 8, 23, 1);
GO

-- Insert Projects
INSERT INTO Projects (ProjectName, Description, StartDate, EndDate, Budget, Status, DepartmentID) VALUES
('Cloud Migration', 'Migrate legacy systems to AWS cloud infrastructure', '2023-01-01', '2024-06-30', 500000.00, 'Active', 1),
('Mobile App v2.0', 'Develop new version of mobile application with enhanced features', '2023-06-01', '2024-03-31', 350000.00, 'Active', 1),
('Brand Refresh Campaign', 'Complete brand identity refresh including website redesign', '2023-09-01', '2024-02-28', 200000.00, 'Active', 2),
('Q4 Sales Initiative', 'Aggressive sales push for Q4 targets', '2023-10-01', '2023-12-31', 150000.00, 'Completed', 3),
('Employee Wellness Program', 'Implement comprehensive wellness benefits', '2023-07-01', '2024-06-30', 100000.00, 'Active', 4),
('Financial System Upgrade', 'Upgrade accounting software and processes', '2023-11-01', '2024-04-30', 250000.00, 'Active', 5),
('AI Research Initiative', 'Research and prototype AI/ML solutions', '2023-03-01', '2024-12-31', 800000.00, 'Active', 7),
('Customer Portal Redesign', 'Redesign self-service customer portal', '2023-08-01', '2024-01-31', 175000.00, 'Active', 8);
GO

-- Insert Project Assignments
INSERT INTO ProjectAssignments (EmployeeID, ProjectID, Role, HoursAllocated) VALUES
(1, 1, 'Technical Lead', 30),
(2, 1, 'Developer', 40),
(5, 1, 'DevOps Lead', 35),
(4, 2, 'Project Lead', 25),
(2, 2, 'Developer', 20),
(3, 2, 'Developer', 40),
(6, 3, 'Project Lead', 30),
(7, 3, 'Marketing Lead', 35),
(8, 3, 'Content Lead', 40),
(9, 4, 'Project Lead', 25),
(10, 4, 'Account Lead', 35),
(11, 4, 'Sales Rep', 40),
(12, 4, 'Sales Rep', 40),
(13, 5, 'Project Lead', 20),
(14, 5, 'HR Coordinator', 30),
(15, 6, 'Project Lead', 25),
(16, 6, 'Technical Lead', 35),
(17, 6, 'Analyst', 40),
(20, 7, 'Research Lead', 30),
(21, 7, 'Senior Researcher', 40),
(22, 7, 'Research Associate', 40),
(1, 7, 'Technical Advisor', 10),
(23, 8, 'Project Lead', 25),
(24, 8, 'Support Lead', 30),
(25, 8, 'Support Analyst', 35);
GO

PRINT 'TestHRDB database created successfully with sample data!';
PRINT 'Tables created: Departments, Employees, Projects, ProjectAssignments';
GO
