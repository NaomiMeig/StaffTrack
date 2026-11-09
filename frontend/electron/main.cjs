
const { app, BrowserWindow } = require('electron')
const { spawn } = require('node:child_process')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

let backendProcess = null
let frontendServer = null

const backendDir = path.resolve(__dirname, '../../backend')
const pythonPath = path.join(
  backendDir,
  '.venv',
  'Scripts',
  'python.exe'
)

const FRONTEND_PORT = 5173
const BACKEND_PORT = 8000

function startBackend() {
  let executable
  let args
  let cwd

  if (app.isPackaged) {
    executable = path.join(
      process.resourcesPath,
      'backend',
      'StaffTrackBackend.exe'
    )
    args = []
    cwd = path.dirname(executable)
  } else {
    executable = pythonPath
    args = [
      '-m',
      'uvicorn',
      'app.main:app',
      '--host',
      '127.0.0.1',
      '--port',
      String(BACKEND_PORT),
    ]
    cwd = backendDir
  }

  const localAppData =
  process.env.LOCALAPPDATA ||
  path.resolve(app.getPath('appData'), '..', 'Local')

  const dataDir = app.isPackaged
  ? path.join(localAppData, 'StaffTrack', 'data')
  : path.join(backendDir, 'data')

  fs.mkdirSync(dataDir, { recursive: true })

  backendProcess = spawn(executable, args, {
    cwd,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      STAFFTRACK_DATA_DIR: dataDir,
    },
  })

  backendProcess.stdout.on('data', (data) => {
  const message = data.toString()
  console.log(`[FastAPI] ${message}`)
    })

    backendProcess.stderr.on('data', (data) => {
    const message = data.toString()
    console.error(`[FastAPI ERROR] ${message}`)
    })

  backendProcess.on('error', (error) => {
    console.error('Impossible de démarrer FastAPI :', error)
  })

  backendProcess.on('close', (code) => {
    console.log(`FastAPI arrêté (code ${code})`)
    backendProcess = null
  })
}

function checkBackend() {
  return new Promise((resolve) => {
    const request = http.get(
      `http://127.0.0.1:${BACKEND_PORT}/health`,
      (response) => {
        response.resume()
        resolve(response.statusCode === 200)
      }
    )

    request.setTimeout(1000, () => {
      request.destroy()
      resolve(false)
    })

    request.on('error', () => resolve(false))
  })
}

async function waitForBackend() {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await checkBackend()) {
      console.log('FastAPI est prêt.')
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(
    'FastAPI ne répond pas. Vérifie le démarrage du backend.'
  )
}

function startFrontendServer() {
  const frontendDir = path.resolve(__dirname, '../dist')

  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  }

  frontendServer = http.createServer((req, res) => {
    let pathname

    try {
      pathname = decodeURIComponent(
        new URL(req.url, `http://127.0.0.1:${FRONTEND_PORT}`).pathname
      )
    } catch {
      res.writeHead(400)
      res.end('Requête invalide')
      return
    }

    const requestedPath = path.resolve(
      frontendDir,
      `.${pathname}`
    )

    if (
      requestedPath !== frontendDir &&
      !requestedPath.startsWith(frontendDir + path.sep)
    ) {
      res.writeHead(403)
      res.end('Accès refusé')
      return
    }

    let filePath = requestedPath

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(frontendDir, 'index.html')
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        res.writeHead(500)
        res.end('Impossible de charger StaffTrack')
        return
      }

      const contentType =
        mimeTypes[path.extname(filePath).toLowerCase()] ||
        'application/octet-stream'

      res.writeHead(200, {
        'Content-Type': contentType,
      })

      res.end(content)
    })
  })

  return new Promise((resolve, reject) => {
    frontendServer.once('error', reject)

    frontendServer.listen(
      FRONTEND_PORT,
      '127.0.0.1',
      () => {
        console.log('Frontend prêt sur 127.0.0.1:5173')
        resolve()
      }
    )
  })
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'StaffTrack',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (app.isPackaged) {
    mainWindow.loadURL(
      `http://127.0.0.1:${FRONTEND_PORT}`
    )
  } else {
    mainWindow.loadURL('http://127.0.0.1:5173')
  }
}

app.whenReady().then(async () => {
  try {
    startBackend()
    await waitForBackend()

    if (app.isPackaged) {
      await startFrontendServer()
    }

    createWindow()
  } catch (error) {
    console.error('Erreur au démarrage de StaffTrack :', error)
    app.quit()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill()
    backendProcess = null
  }

  if (frontendServer) {
    frontendServer.close()
    frontendServer = null
  }
})
