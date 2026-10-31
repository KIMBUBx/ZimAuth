# ZimAuth — Open-Source Cloud Licensing & Authentication System

ZimAuth is a complete, self-hosted replication and alternative to KeyAuth (`https://keyauth.cc/`), featuring full dark-mode aesthetics, developer management dashboard, and 100% KeyAuth 1.2 SDK protocol compatibility.

**All premium and enterprise plans are permanently unlocked and free for all users:**
- Unlimited applications
- Unlimited license key generation
- Hardware ID (HWID) locking and instant resets
- Cloud variables & protected encrypted file hosting
- Discord webhook notifications & real-time client audit logs
- Multi-language SDK support (C++, C#, Python, REST API)

---

## 🚀 Quick Start

### 1. Start the Server
Double-click `start.bat` or run:
```bash
node server.js
```
The server will start at:
- **Website & Dashboard:** [http://localhost:3000](http://localhost:3000)
- **KeyAuth Client API Endpoint:** `http://localhost:3000/api/1.2/`

### 2. Default Admin Credentials
- **Username:** `admin`
- **Password:** `admin123`
*(Or click "Create Account" on the login page — every new account is automatically granted full Enterprise Lifetime access at $0).*

---

## 📁 System Architecture

```text
D:\KIM\KIMAUTH\
├── server.js              # Express HTTP & API Server
├── package.json           # Dependencies (sql.js, express, bcryptjs, jwt, etc.)
├── start.bat              # 1-Click Windows Launcher
├── zimauth.sqlite         # SQLite Database (Embedded WAL-mode database)
├── src/
│   ├── database.js        # SQLite Schema & persistence manager
│   ├── auth.js            # Password hashing, JWT & session auth
│   ├── apiRouter.js       # KeyAuth 1.2 & 1.0 Client SDK API protocol handler
│   └── dashboardRouter.js # Web dashboard REST API (Apps, Keys, Users, Files, Logs)
├── public/
│   ├── index.html         # Landing page (KeyAuth replicated theme & free pricing)
│   ├── login.html         # Login & Registration portal
│   ├── dashboard.html     # Full management panel (Keys, HWID, Users, Variables, Webhooks)
│   ├── css/style.css      # Dark glassmorphism & neon theme styling
│   └── js/app.js          # Interactive frontend controller & code generator
└── uploads/               # Protected file storage for client downloads
```

---

## 🔌 Client SDK Compatibility

ZimAuth supports drop-in compatibility with standard KeyAuth client SDKs. You only need to set the API endpoint URL to your ZimAuth server (`http://localhost:3000/api/1.2/`).

### Python Example
```python
import requests

API_URL = "http://localhost:3000/api/1.2/"

# 1. Initialize Application
init_res = requests.post(API_URL, data={
    "type": "init",
    "name": "YourAppName",
    "ownerid": "YOUR_OWNER_ID",
    "secret": "YOUR_APP_SECRET",
    "version": "1.0"
}).json()

sessionid = init_res["sessionid"]

# 2. Authenticate with License Key
login_res = requests.post(API_URL, data={
    "type": "license",
    "key": "ZIM-XXXXXX-XXXXXX",
    "hwid": "USER_HARDWARE_ID",
    "sessionid": sessionid
}).json()

if login_res.get("success"):
    print("Welcome! Logged in.")
```

### C++ Example
```cpp
#include <iostream>
#include "KeyAuth.hpp"

std::string name = "YourAppName";
std::string ownerid = "YOUR_OWNER_ID";
std::string secret = "YOUR_APP_SECRET";
std::string version = "1.0";
std::string url = "http://localhost:3000/api/1.2/";

KeyAuth::api KeyAuthApp(name, ownerid, secret, version, url);

int main() {
    KeyAuthApp.init();
    KeyAuthApp.license("ZIM-XXXXXX-XXXXXX");
    if (KeyAuthApp.data.success) {
        std::cout << "Authenticated successfully!" << std::endl;
    }
}
```

### C# / .NET Example
```csharp
using KeyAuth;

public static api KeyAuthApp = new api(
    name: "YourAppName",
    ownerid: "YOUR_OWNER_ID",
    secret: "YOUR_APP_SECRET",
    version: "1.0",
    url: "http://localhost:3000/api/1.2/"
);

KeyAuthApp.init();
KeyAuthApp.license("ZIM-XXXXXX-XXXXXX");
```

---

## 🛠 Features Included

| Feature | KeyAuth Official | ZimAuth |
|---|---|---|
| License Key Generation | Paid Tier | **100% Free / Unlimited** |
| Hardware ID (HWID) Locking | Paid Tier | **100% Free / Unlimited** |
| Unlimited Applications | Paid ($79/mo) | **100% Free** |
| Cloud Variables & Secrets | Limited | **100% Free** |
| Protected File Hosting | Limited | **100% Free** |
| Discord Webhook Alerts | Included | **100% Free** |
| Local Latency & Privacy | Cloud-dependent | **Local & Self-Hosted** |
