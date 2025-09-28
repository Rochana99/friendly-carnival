const {
    makeWASocket,
    useMultiFileAuthState,
    makeInMemoryStore,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');

// Chat Data ගබඩා කිරීමට 'Store' එක සකසයි
const store = makeInMemoryStore({ logger: pino({ level: 'silent' }) });

const startBot = async () => {
    // 1. Session ගොනු ගබඩා කිරීම සඳහා වූ State එක සකස් කිරීම
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    
    // 2. නවතම Baileys Version එක ලබා ගැනීම
    const { version } = await fetchLatestBaileysVersion();

    // 3. Bot Socket එක නිර්මාණය කිරීම
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), 
        auth: state,
        browser: ['AutoClearBot', 'Chrome', '1.0.0'], 
        syncFullHistory: false,
    });
    
    // 4. Store එක, sock එකේ Events සමග සම්බන්ධ කිරීම
    store.bind(sock.ev);

    // --- Connection State Handling ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, pairingCode } = update;
        
        if (pairingCode && !sock.authState.creds.registered) {
            console.log('\n=================================================');
            console.log(`| Pair Code: ${pairingCode} |`);
            console.log('=================================================\n');
            console.log('WhatsApp -> Linked Devices -> Link with phone number තෝරා මෙම Pair Code එක ඇතුළු කරන්න.');

        } else if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(() => startBot(), 5000); // තත්පර 5 කින් නැවත සම්බන්ධ වීමට උත්සාහ කරන්න
            }
        } else if (connection === 'open') {
            console.log('✅ Successfully connected to WhatsApp! Bot is Ready. (24/7 Active)');
        }
    });

    // 5. Credentials (ලොග් වීම් තොරතුරු) ඉතිරි කිරීම (Save)
    sock.ev.on('creds.update', saveCreds);

    // --- Core Function: Pin Chats Auto Delete Messages ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            // System messages සහ Bot එකෙන් යවන messages මගහැරීම
            if (!msg.key.fromMe && msg.key.remoteJid) {
                const chatId = msg.key.remoteJid;

                // Chat එකේ විස්තර Store එකෙන් ලබා ගැනීම
                const chat = store.chats.get(chatId);

                // Chat එක Pin කර තිබේදැයි පරීක්ෂා කිරීම (pin > 0 නම් Pin කර ඇත)
                const isPinned = chat && chat.pin > 0;

                if (isPinned) {
                    try {
                        // පණිවිඩය ලැබුණු වහාම එය 'Delete for Me' කිරීම
                        await sock.chatModify({
                            delete: 'messages', 
                            messages: [msg.key] 
                        }, chatId);

                        // console.log(`✅ Pinned Chat එකෙන් (ID: ${chatId}) ලැබුණු පණිවිඩය successfully deleted for you.`);
                    } catch (error) {
                        // console.error(`❌ Message delete කිරීමේදී දෝෂයක්: ${chatId}:`, error.message);
                        // දෝෂ තිබුණත් bot එක දිගටම ක්‍රියාත්මක වීමට ඉඩ හරින්න
                    }
                }
            }
        }
    });
};

// Replit හිදි නිරතුරුවම සක්‍රීයව තබා ගැනීමට (Keep Alive) අවශ්‍ය සරල web server එක
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('WhatsApp Auto Clear Bot is Running 24/7!');
});

app.listen(PORT, () => {
    console.log(`Bot Keep-Alive Server listening on port ${PORT}`);
    startBot();
});
