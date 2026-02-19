require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

const apiId = parseInt(process.env.API_ID_1);
const apiHash = process.env.API_HASH_1;
const stringSession = new StringSession(process.env.SESSION_1);

let client;
(async () => {
  client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
  await client.start({ phoneNumber: async () => { throw new Error('Already logged in') } });
  console.log('Telegram client connected');
})();

/* ================= EXPORT STATE ================= */
let exportData = {
  running: false,
  total: 0,
  current: 0,
  members: [],
  interval: null
};

/* ================= ROUTES ================= */
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/mygroups', async (req, res) => {
  try {
    const dialogs = await client.getDialogs();
    const groups = dialogs
      .filter(d => d.isGroup || d.isChannel)
      .map(d => ({
        username: d.username || d.id.toString(),
        title: d.title,
        type: d.isChannel ? 'channel' : 'group',
        role: d.adminRights ? 'admin' : 'member'
      }));
    res.json({ success: true, groups });
  } catch (err) {
    console.log(err);
    res.json({ success: false, groups: [] });
  }
});

app.post('/export', async (req, res) => {
  if(exportData.running) return res.json({ success: false, message: "Export running" });

  const { target, limitCount } = req.body;
  exportData.running = true;
  exportData.current = 0;
  exportData.members = [];

  const entity = await client.getEntity(target);
  let participants = await client.getParticipants(entity, { limit: limitCount || 0 });

  exportData.total = participants.length;

  exportData.interval = setInterval(() => {
    if(exportData.current >= exportData.total){
      clearInterval(exportData.interval);
      exportData.running = false;
      return;
    }
    const member = participants[exportData.current];
    exportData.members.push(member.username || member.id.toString());
    exportData.current++;
  }, 50);

  res.json({ success: true });
});

app.get('/progress', (req, res) => {
  res.json({
    running: exportData.running,
    total: exportData.total,
    current: exportData.current,
    members: exportData.members
  });
});

app.post('/stop', (req, res) => {
  if(exportData.interval) clearInterval(exportData.interval);
  exportData.running = false;
  res.json({ success: true });
});

app.get('/download/excel', (req, res) => {
  const filePath = path.join(__dirname, 'export.xlsx');
  fs.writeFileSync(filePath, exportData.members.join('\n'));
  res.download(filePath, 'export.xlsx');
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
