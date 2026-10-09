# ROC / MCA Company Lookup API: How to Run It

This guide takes you from nothing installed to getting a company's details back from the API. No programming knowledge is needed. Follow the steps in order.

## What this program does

You give it a few letters of a company or LLP name, and it returns a list of matching companies. You pick one, and it returns that company's full details (address, status, directors and so on). The data comes live from ZaubaCorp.

It runs inside Docker. Docker is a tool that packages a program with everything it needs, so you do not have to install Node.js or anything else yourself.

---

## Part 1: Install what you need (one time only)

You need two things: **Git** (to download the code) and **Docker**.

### Windows
1. Install Git from https://git-scm.com/download/win. Accept the default options.
2. Install Docker Desktop from https://www.docker.com/products/docker-desktop. Restart the computer if it asks.
3. Open Docker Desktop and wait until it says Docker is running (a green indicator at the bottom left).

### Linux server
```
sudo apt update
sudo apt install -y git
curl -fsSL https://get.docker.com | sudo sh
```

### Check that both are installed
Open a terminal (PowerShell on Windows) and run:
```
git --version
docker --version
docker compose version
```
Each one should print a version number. If any says "not recognized" or "command not found", that tool is not installed yet.

---

## Part 2: Download the code

In the terminal, go to the folder where you want the project, then run:
```
git clone https://github.com/sahilcingh/ROC.git
cd ROC
```
If GitHub asks you to sign in, the repository is private. Ask the owner to add your GitHub account as a collaborator.

The `cd ROC` command moves you into the project folder. **Every command after this must be run from inside this folder.**

---

## Part 3: Create the settings file (`.env`)

The program needs three settings. You put them in a file named `.env` in the project folder.

### 3.1 Copy the example file

Windows (PowerShell):
```
Copy-Item .env.example .env
```
Linux:
```
cp .env.example .env
```

### 3.2 Edit the file

Open `.env` in Notepad (Windows: `notepad .env`) or any editor (Linux: `nano .env`). It looks like this:
```
PORT=4000
SCODE_GETCIN=change_me
SCODE_MASTER=change_me
```

Replace `change_me` in both lines:
```
PORT=4000
SCODE_GETCIN=your-search-password
SCODE_MASTER=your-details-password
```

What each line means:

| Setting | Meaning |
|---|---|
| `PORT` | The port number the program listens on. Leave it at 4000 unless something else already uses it. |
| `SCODE_GETCIN` | A password that protects the **search** request. Anyone calling the search must send this exact value. |
| `SCODE_MASTER` | A password that protects the **details** request. Anyone calling the details must send this exact value. |

How to choose the two passwords:
- If you already have an app (client) that calls this API and sends an `SCode`, use the exact values that app sends.
- If not, make up two values yourself: 16 to 32 letters and numbers, for example `Kp8x2mQ9vL4tR7wZ`. Avoid spaces, quotes, `#` and `$`.

Rules for the file:
- No spaces around `=`, and no quotation marks.
- The file must be named exactly `.env`. Notepad sometimes saves it as `.env.txt`. If that happens, rename it. In Notepad, set "Save as type" to "All Files".
- Never share this file or upload it to GitHub. It holds your passwords.

---

## Part 4: Start the program

Make sure Docker is running (on Windows, Docker Desktop must be open). From the project folder, run:
```
docker compose up -d --build
```
- The first run takes one to three minutes while Docker builds the program. Later runs are fast.
- `-d` means it keeps running in the background, so you can close the window.

Check that it started:
```
docker compose ps
```
The status should say **running**. To see the program's own messages:
```
docker compose logs
```
You should see `Server listening on port 4000`.

---

## Part 5: Check that it works

Open a browser and go to:
```
http://localhost:4000/SData
```
You should see:
```
{"msg":"Hello"}
```
This means the program is up. (On a remote server, replace `localhost` with the server's address.)

---

## Part 6: Get company information

There is no web page to type into. You send two requests to the program and it answers. The easiest way is a PowerShell window; it can be open in any folder.

The answer prints in the same window right below the command.

### Request 1: Search by company name

Copy this, change the name in `ComName`, and put your `SCODE_GETCIN` value in `SCode`:
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:4000/MCAGetCIN -ContentType "application/json" -Body '{"ComName":"MDA Soft","SCode":"your-search-password"}'
```
- `ComName` must be at least 3 characters.

Example result:
```
RData
-----
MDA SOFTWARES LIMITED~MDA-SOFTWARES-LIMITED-U72200DL1997PLC088853^MDA SOFTECH SOLUTIONS PRIVATE LIMITED~MDA-SOFTECH-SOLUTIONS-PRIVATE-LIMITED-U72900WB2011PTC169263
```
How to read it:
- Each company is written as `Name~Identifier`.
- Companies are separated by `^`.
- The **identifier** (the part after `~`) is what you need for the next request.

### Request 2: Get the full details of one company

Pick a company from the list. Copy its identifier into `CIN`, and put your `SCODE_MASTER` value in `SCode`:
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:4000/MDAGetCINMasterData -ContentType "application/json" -Body '{"CIN":"MDA-SOFTWARES-LIMITED-U72200DL1997PLC088853","SCode":"your-details-password"}'
```
The result is one long line of `Key:Value` pairs separated by `^`, for example:
```
ComName:MDA SOFTWARES LIMITED^Addr:...^Email:...^Comp_Status:Active^RocCode:ROC Delhi^...
```
It includes the address, status, class, incorporation date, directors, and each director's other directorships. You cannot choose which fields come back; you always get everything available.

### On Linux or macOS

Use `curl` instead:
```
curl -X POST http://localhost:4000/MCAGetCIN -H "Content-Type: application/json" -d '{"ComName":"MDA Soft","SCode":"your-search-password"}'
```
```
curl -X POST http://localhost:4000/MDAGetCINMasterData -H "Content-Type: application/json" -d '{"CIN":"MDA-SOFTWARES-LIMITED-U72200DL1997PLC088853","SCode":"your-details-password"}'
```

### Using it from an app

If you already have an app, it should send these same two requests (the search, then the details), with the same field names (`ComName`, `CIN`, `SCode`).

Opening these two addresses in a browser will not work, because they only accept POST requests. Only `/SData` works in a browser.

---

## Part 7: Everyday commands

Run these from the project folder.

| What you want | Command |
|---|---|
| See what is happening | `docker compose logs -f` (press Ctrl+C to stop watching) |
| Stop the program | `docker compose down` |
| Start it again | `docker compose up -d` |
| Restart it | `docker compose restart` |
| Update to the newest code | `git pull` then `docker compose up -d --build` |
| Apply new passwords | Edit `.env`, then run `docker compose up -d` |

The program also restarts by itself after a crash or a server reboot.

---

## Troubleshooting

| What you see | Likely cause and fix |
|---|---|
| `docker` is not recognized | Docker is not installed, or Docker Desktop is not open. Install or open it. |
| "Cannot connect to the Docker daemon" | Docker is not running. Open Docker Desktop, wait for it to finish starting, and try again. |
| Compose says `set SCODE_GETCIN in .env` | The `.env` file is missing, misnamed (for example `.env.txt`), or in the wrong folder. It must sit next to `docker-compose.yml`. |
| `UnAuthorized Access !` | The `SCode` in your request does not match `.env`. Check the spelling and capital letters. |
| `Enter atleast 3 characters for Company/LLP Name !` | `ComName` is shorter than 3 characters. |
| `Error: Blocked by site protection` | ZaubaCorp is blocking this server or network. Try again later, try from another network, and run `docker compose build --no-cache` to make sure the newest tools are used. |
| `No Data Found !` | The identifier is wrong or does not exist. Copy it again from the search result. |
| Cannot connect to `localhost:4000` | The program is not running (`docker compose ps`), or `PORT` in `.env` is not 4000. Use the port you set. |
| "port is already allocated" | Something else uses port 4000. Change `PORT` in `.env` to another number such as 5000, then run `docker compose up -d`. |

---

## Good to know

- The server must be able to reach the internet (zaubacorp.com).
- The program uses plain HTTP and sends the `SCode` passwords in the request, so on a public server put it behind HTTPS (for example with Nginx or Caddy) or restrict who can reach it with a firewall.
- There is no limit on how often it can be called yet, so do not expose it openly to the internet.
- Never commit `.env` to Git.
