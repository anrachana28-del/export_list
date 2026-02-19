const express = require("express");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static("."));

const apiId = parseInt(process.env.API_ID_1);
const apiHash = process.env.API_HASH_1;
const stringSession = new StringSession(process.env.SESSION_1);

const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
let exportData = { running:false, current:0, total:0, members:[], interval:null };

(async () => { await client.start({ phoneNumber: async () => prompt("Number?"), password: async () => prompt("Password?") }); console.log("Telegram Client ready"); })();

// Dummy mygroups endpoint
app.get("/mygroups", async(req,res)=>{
  // Return some groups example
  res.json({ success:true, groups:[ {username:"mygroup1",title:"My Group 1"}, {username:"mygroup2",title:"My Group 2"} ] });
});

// Start export
app.post("/export", async(req,res)=>{
  if(exportData.running) return res.json({ success:false,message:"Export already running" });

  const { target, profileFilter, onlineFilter, limitCount } = req.body;
  exportData = { running:true, current:0, total:0, members:[], interval:null };

  try{
    const entity = await client.getEntity(target);
    let participants = await client.getParticipants(entity,{limit:limitCount || 0});

    participants = participants.filter(m=>{
      if(m.bot) return false;
      if(!m.username && !m.firstName) return false; // private/deleted
      if(profileFilter==='with' && !m.photo) return false;
      if(profileFilter==='without' && m.photo) return false;
      // last online filter can be added here
      return true;
    });

    exportData.total = participants.length;

    exportData.interval = setInterval(()=>{
      if(exportData.current>=exportData.total){
        clearInterval(exportData.interval);
        exportData.running=false;
        return;
      }
      const member = participants[exportData.current];
      exportData.members.push(member.username || member.id.toString());
      exportData.current++;
    },50);

    res.json({ success:true });
  }catch(err){ console.log(err); exportData.running=false; res.json({ success:false,message:err.message }); }
});

// Stop export
app.post("/stop",(req,res)=>{
  if(exportData.interval) clearInterval(exportData.interval);
  exportData.running=false;
  res.json({ success:true });
});

// Progress
app.get("/progress",(req,res)=>{
  res.json(exportData);
});

// Download Excel
app.get("/download/excel",(req,res)=>{
  const header="Username/ID\n";
  const data = exportData.members.join("\n");
  fs.writeFileSync("export.xlsx",header+data);
  res.download("export.xlsx");
});

app.listen(process.env.PORT||3000,()=>console.log("Server running..."));
