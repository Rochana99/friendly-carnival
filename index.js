const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
} = require('@whiskeysockets/baileys');
const pino = require('pino');

// makeInMemoryStore දෝෂය නිවැරදි කිරීම: Baileys හි නවතම අනුවාද සඳහා නිවැරදි path එක.
const { makeInMemoryStore } = require('@whiskeysockets/baileys/lib/Utils/makeInMemoryStore');

// Chat Data ගබඩා කිරීමට 'Store' එක සකසයි
const store = makeInMemoryStore({ logger: pino({ level: 'silent' }) });

const startBot = async () => {
    // 1. Session ගොනු ගබඩා කිරීම සඳහා වූ State එක සකස් කිරීම
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    
    // 2. Bot Socket එක නිර්මාණය කිරීම
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }), // Console logs නිහඬ කරයි
        auth: state,
        browser: ['TermuxAutoClearBot', 'Chrome', '1.0.0'], // Device Name එක
        syncFullHistory: false,
    });
    
    // 3. Store එක, sock එකේ Events සමග සම්බන්ධ කිරීම
    store.bind(sock.ev);

    // --- Connection State Handling (සම්බන්ධතා කළමනාකරණය) ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, pairingCode } = update;
        
        if (pairingCode && !sock.authState.creds.registered) {
            // Pair Code මගින් ලොග් වීම සඳහා
            console.log('\n=================================================');
            console.log(`| Pair Code: ${pairingCode} |`);
            console.log('=================================================\n');
            console.log('WhatsApp -> Linked Devices -> Link with phone number තෝරා මෙම Pair Code එක ඇතුළු කරන්න.');

        } else if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            // Log Out නම් නැවත සම්බන්ධ වීමට උත්සාහ නොකරයි.
            if (shouldReconnect) {
                // Termux මත ස්ථාවරව නැවත සම්බන්ධ වීමට උත්සාහ කරන්න
                setTimeout(() => startBot(), 5000); 
            }
        } else if (connection === 'open') {
            console.log('✅ Successfully connected to WhatsApp! Bot is Ready.');
        }
    });

    // 4. Credentials (ලොග් වීම් තොරතුරු) ඉතිරි කිරීම (Save)
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

                    } catch (error) {
                        // console.error(`❌ Message delete කිරීමේදී දෝෂයක්: ${chatId}:`, error.message);
                    }
                }
            }
        }
    });
};

// Bot එක ආරම්භ කරන්න
startBot();
