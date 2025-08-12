 import pyodbc
import time

def create_database():
    try:
        # Connection string for Azure SQL Edge
        conn_str = (
            "DRIVER={ODBC Driver 18 for SQL Server};"
            "SERVER=mssql,1433;"
            "DATABASE=master;"
            "UID=sa;"
            "PWD=l.messi10;"
            "TrustServerCertificate=yes;"
        )
        
        print("Connecting to SQL Server...")
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        
        # Test basic connection
        cursor.execute("SELECT @@VERSION")
        version = cursor.fetchone()[0]
        print(f"✅ Connected successfully!")
        print(f"SQL Server version: {version}")
        
        # Check if TestCompanyDB exists
        cursor.execute("SELECT name FROM sys.databases WHERE name = 'TestCompanyDB'")
        result = cursor.fetchone()
        
        if result:
            print("✅ TestCompanyDB already exists!")
        else:
            print("❌ TestCompanyDB does not exist")
            print("Creating TestCompanyDB...")
            
            # Create the database
            cursor.execute("CREATE DATABASE TestCompanyDB")
            print("✅ TestCompanyDB created successfully!")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

if __name__ == "__main__":
    print("Creating TestCompanyDB...")
    
    # Try multiple times as SQL Server might still be starting
    for attempt in range(5):
        print(f"Attempt {attempt + 1}/5...")
        if create_database():
            break
        time.sleep(10)
    else:
        print("Failed to create database after 5 attempts")
