// MEGA GRID testnet demo — hardened
const { RPC_URL, CHAIN_ID, CONTRACT_ADDRESS } = window.MEGA_GRID_CONFIG;
const HEX_CHAIN_ID = "0x" + CHAIN_ID.toString(16);

const ABI = [
  { "inputs":[{"internalType":"uint256","name":"gridSize_","type":"uint256"}], "stateMutability":"nonpayable","type":"constructor"},
  { "inputs":[], "name":"GRID_SIZE","outputs":[{"internalType":"uint256","name":"","type":"uint256"}], "stateMutability":"view","type":"function"},
  { "inputs":[{"internalType":"uint256","name":"id","type":"uint256"}], "name":"colorOf","outputs":[{"internalType":"uint32","name":"","type":"uint32"}], "stateMutability":"view","type":"function"},
  { "inputs":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"uint32","name":"rgb","type":"uint32"}], "name":"colorPixel","outputs":[], "stateMutability":"nonpayable","type":"function"},
  { "inputs":[{"internalType":"uint256[]","name":"ids","type":"uint256[]"},{"internalType":"uint32[]","name":"rgbs","type":"uint32[]"}], "name":"colorPixels","outputs":[], "stateMutability":"nonpayable","type":"function"},
  { "anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"id","type":"uint256"},{"indexed":false,"internalType":"uint32","name":"rgb","type":"uint32"}], "name":"PixelColored","type":"event"},
  { "anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256[]","name":"ids","type":"uint256[]"},{"indexed":false,"internalType":"uint32[]","name":"rgbs","type":"uint32[]"}], "name":"PixelsColored","type":"event"}
];

const statusEl = document.getElementById("status");
const connectBtn = document.getElementById("connect");
const flushBtn = document.getElementById("flush");
const pxSizeInput = document.getElementById("pxSize");
const gridSizeLabel = document.getElementById("gridSizeLabel");
const modeSel = document.getElementById("mode");
const picker = document.getElementById("picker");
const canvasWrap = document.getElementById("canvasWrap");

const rgbIntToHex = (rgb) => (rgb >>> 0) & 0xffffff;
const hexToRgbInt = (hex) => (hex >>> 0) & 0xffffff;

// PIXI + state
let GRID_SIZE = 128;
let PIXEL_SIZE = Number(pxSizeInput.value) || 5;
let app, stageGraphics, hoverGraphics;
let buffer = new Map();

function setupPixi() {
  const width = GRID_SIZE * PIXEL_SIZE, height = GRID_SIZE * PIXEL_SIZE;
  app = new PIXI.Application({ width, height, background: "#0b0b0b", antialias: false });
  canvasWrap.innerHTML = ""; canvasWrap.appendChild(app.view);

  stageGraphics = new PIXI.Graphics(); app.stage.addChild(stageGraphics);

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const c = ((x + y) % 2 === 0) ? 0x141414 : 0x101010;
      stageGraphics.beginFill(c);
      stageGraphics.drawRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
      stageGraphics.endFill();
    }
  }

  hoverGraphics = new PIXI.Graphics(); app.stage.addChild(hoverGraphics);

  app.view.addEventListener("mousemove", (e) => {
    const r = app.view.getBoundingClientRect();
    const gx = Math.floor((e.clientX - r.left) / PIXEL_SIZE);
    const gy = Math.floor((e.clientY - r.top) / PIXEL_SIZE);
    if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) return;
    hoverGraphics.clear();
    hoverGraphics.lineStyle(1, 0xffffff, 0.7);
    hoverGraphics.drawRect(gx * PIXEL_SIZE, gy * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
  });

  app.view.addEventListener("click", (e) => {
    const r = app.view.getBoundingClientRect();
    const gx = Math.floor((e.clientX - r.left) / PIXEL_SIZE);
    const gy = Math.floor((e.clientY - r.top) / PIXEL_SIZE);
    if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) return;
    const id = gy * GRID_SIZE + gx;
    const hex = (modeSel.value === "picker")
      ? Number("0x" + picker.value.slice(1))
      : ((Math.floor(Math.random() * 0x90) + 0x60) << 16)
        | ((Math.floor(Math.random() * 0x90) + 0x60) << 8)
        |  (Math.floor(Math.random() * 0x90) + 0x60);
    buffer.set(id, hex);
    paintLocal(gx, gy, hex);
  });
}

function paintLocal(x, y, hex) {
  stageGraphics.beginFill(hex);
  stageGraphics.drawRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
  stageGraphics.endFill();
}

// viem clients
let publicClient, walletClient;

async function init() {
  try {
    const { createPublicClient, http } = viem;
    publicClient = createPublicClient({
      transport: http(RPC_URL),
      chain: {
        id: CHAIN_ID,
        name: "MegaETH Testnet",
        nativeCurrency: { name: "MEGA", symbol: "MEGA", decimals: 18 },
        rpcUrls: { default: { http: [RPC_URL] } }
      }
    });
  } catch (e) {
    console.error("viem not loaded?", e);
  }

  try {
    const size = await publicClient.readContract({
      address: CONTRACT_ADDRESS, abi: ABI, functionName: "GRID_SIZE"
    });
    GRID_SIZE = Number(size) || 128;
  } catch (e) {
    console.warn("GRID_SIZE read failed; using 128", e?.message || e);
    GRID_SIZE = 128;
  }

  gridSizeLabel.textContent = GRID_SIZE.toString();
  setupPixi();
  subscribeEvents();
}

function subscribeEvents() {
  if (!publicClient) return;
  publicClient.watchEvent({
    address: CONTRACT_ADDRESS, abi: ABI, eventName: "PixelColored",
    onLogs: logs => logs.forEach(l => {
      const id = Number(l.args.id), rgb = Number(l.args.rgb);
      paintLocal(id % GRID_SIZE, Math.floor(id / GRID_SIZE), rgbIntToHex(rgb));
    })
  });
  publicClient.watchEvent({
    address: CONTRACT_ADDRESS, abi: ABI, eventName: "PixelsColored",
    onLogs: logs => logs.forEach(l => {
      const ids = l.args.ids.map(Number), rgbs = l.args.rgbs.map(Number);
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        paintLocal(id % GRID_SIZE, Math.floor(id / GRID_SIZE), rgbIntToHex(rgbs[i]));
      }
    })
  });
}

connectBtn.addEventListener("click", async () => {
  try {
    if (!window.ethereum) return alert("No wallet found. Install MetaMask.");
    const current = await window.ethereum.request({ method: "eth_chainId" });
    if (current !== HEX_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: HEX_CHAIN_ID }]
        });
      } catch (switchErr) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: HEX_CHAIN_ID,
              chainName: "MegaETH Testnet",
              nativeCurrency: { name: "MEGA", symbol: "MEGA", decimals: 18 },
              rpcUrls: [RPC_URL],
              blockExplorerUrls: []
            }]
          });
        } catch (addErr) {
          console.error("Add chain failed", addErr);
          return alert("Please switch to MegaETH Testnet manually in your wallet.");
        }
      }
    }
    const [addr] = await window.ethereum.request({ method: "eth_requestAccounts" });
    const { createWalletClient, custom } = viem;
    walletClient = createWalletClient({ chain: { id: CHAIN_ID }, transport: custom(window.ethereum) });
    statusEl.textContent = `connected: ${addr.slice(0,6)}…${addr.slice(-4)}`;
  } catch (e) {
    console.error(e);
    alert("Wallet connection failed");
  }
});

flushBtn.addEventListener("click", async () => {
  if (!walletClient) return alert("Connect wallet first.");
  if (buffer.size === 0) { statusEl.textContent = "no changes"; return; }
  const ids = Array.from(buffer.keys());
  const rgbs = Array.from(buffer.values()).map(hexToRgbInt);
  try {
    statusEl.textContent = `sending ${ids.length} tiles…`;
    const hash = await walletClient.writeContract({
      account: (await walletClient.requestAddresses())[0],
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: "colorPixels",
      args: [ids, rgbs]
    });
    statusEl.textContent = `tx: ${hash.slice(0,10)}…`;
    buffer.clear();
  } catch (e) {
    console.error(e);
    statusEl.textContent = "tx failed";
  }
});

pxSizeInput.addEventListener("change", () => {
  const v = Math.max(2, Math.min(20, Number(pxSizeInput.value) || 5));
  PIXEL_SIZE = v;
  setupPixi();
});

init();
