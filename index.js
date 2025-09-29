const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeInMemoryStore, 
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

// Console Logs සම්පූර්ණයෙන්ම නිහඬ කරයි (Stealth Mode)
const logger = pino({ level: 'silent' });

// Chats Store එක සාදයි (Pin Status බැලීමට)
const store = makeInMemoryStore({ logger });

const startStealthAutoClearBot = async () => {
    // Session ගොනු 'sessions/' ෆෝල්ඩරයේ ගබඩා කරයි
    const { state, saveCreds } = await useMultiFileAuthState('./sessions');
    
    // Baileys හි නවතම Version එක ලබා ගනී
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        logger: logger, 
        printQRInTerminal: false, 
        browser: Browsers.macOS('Firefox'), 
        auth: state,
        version: version,
        syncFullHistory: true, 
    });
    
    // Store එක, sock එකේ Events සමග සම්බන්ධ කරයි
    store.bind(sock.ev);

    // --- Connection State Handling ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, pairingCode } = update;
        
        // Bot එක ලොග් වී නැති විට Pair Code එක ජනනය කරයි
        if (pairingCode && !sock.authState.creds.registered) {
            // Pair Code එක Console එකට Print කරයි
            console.log('\n=================================================');
            console.log(`| Pair Code: ${pairingCode} |`); 
            console.log('=================================================\n');
            console.log('WhatsApp -> Linked Devices -> Link with phone number තෝරා මෙම Pair Code එක ඇතුළු කරන්න. (තත්පර 180ක් ඇතුළත)');

        } else if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                // විසන්ධි වූ විට නැවත සම්බන්ධ වීමට උත්සාහ කරයි
                setTimeout(() => startStealthAutoClearBot(), 5000); 
            } else {
                // Logged Out නම් Session Files මකා දමා නැවත ආරම්භ වේ
                logger.info('Logged out. Deleting session files and restarting...');
                fs.rmSync('./sessions', { recursive: true, force: true });
                setTimeout(() => startStealthAutoClearBot(), 1000);
            }
        } else if (connection === 'open') {
            // සම්බන්ධ වූ පසු කිසිදු Message එකක් හෝ Image එකක් නොයවයි
            logger.info('✅ Stealth Auto Clear Bot connected successfully.');
        }
    });

    // --- Credentials (ලොග් වීම් තොරතුරු) ඉතිරි කිරීම (Save) ---
    sock.ev.on('creds.update', saveCreds);

    // --- Core Function: Pin Chats Auto Delete Messages ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            // Bot එකෙන් යවන messages සහ System messages මගහැරීම
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
                        logger.error('Error deleting message:', error);
                    }
                }
            }
        }
    });
};

// Bot එක ආරම්භ කරන්න
startStealthAutoClearBot();
