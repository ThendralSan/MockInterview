# 🦜 Parakeet AI - Real-Time Technical Interview Assistant

A real-time, hands-free technical interview copilot designed for senior .NET Full Stack developers (C#, ASP.NET Core, EF Core, Angular, SQL Server, Azure, Microservices).

---

## 🚀 How to Run Independently (Without Opening the IDE)

You can launch and use the application directly from Windows without opening VS Code or any IDE:

### 1. One-Click Launch (Recommended)
1. Open the project folder: `D:\MockInterview`
2. Double-click **`start.bat`**.
3. That's it!
   - It starts the high-speed backend server and production UI in under **1 second**.
   - It automatically opens your web browser to **`http://localhost:8080`**.
   - Both the visual interface, microphone audio engine, and Gemini AI streaming operate seamlessly together.

### 2. Launch from Desktop (Optional Desktop Shortcut)
1. In `D:\MockInterview`, double-click **`create-desktop-shortcut.bat`** (or right-click `start.bat` -> **Send to** -> **Desktop (create shortcut)**).
2. A shortcut named **Parakeet AI Copilot** will appear directly on your Windows Desktop.
3. You can now launch your assistant anytime directly from your Desktop with a single double-click!

### 3. How to Stop the Application
- Simply **close the command prompt window** that opened with `start.bat`, or press **`Ctrl+C`**.
- Alternatively, double-click **`stop.bat`** in `D:\MockInterview` to immediately stop any running processes on port 8080.

---

## 🛠 Available Helper Scripts

| File | Purpose |
| :--- | :--- |
| **`start.bat`** | Launches the application on `http://localhost:8080` and opens your browser. |
| **`stop.bat`** | Halts the server and frees port 8080. |
| **`build.bat`** | Rebuilds the Angular frontend bundle if you ever edit UI or CSS files. |
| **`create-desktop-shortcut.bat`** | Creates a 1-click launch icon directly on your Windows Desktop. |

---

## 🌐 URLs & Ports

- **Application Web Interface**: `http://localhost:8080`
- **Real-Time WebSocket**: `ws://localhost:8080`
- **Session & History Persistence**: Stored automatically in `backend/data/session_store.json`.

