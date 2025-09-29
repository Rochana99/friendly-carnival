const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
} = require('@whiskeysockets/baileys');
const pino = require('pino');

// Store Module ඉවත් කර ඇති නිසා, Bot එක සියලුම Chats වල පණිවිඩ Clear කරනු ඇත.

const startBot = async () => {
    // 1. Session ගොනු ගබඩා කිරීම සඳහා වූ State එක සකස් කිරීම
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    
    // 2. Bot Socket එක නිර්මාණය කිරීම
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }), // Console logs නිහඬ කරයි
        auth: state,
        browser: ['GithubAutoClearBot', 'Chrome', '1.0.0'], // Device Name
        syncFullHistory: false,
    });
    
    // --- Connection State Handling ---
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
            if (shouldReconnect) {
                // විසන්ධි වූ විට නැවත ආරම්භ වේ
                setTimeout(() => startBot(), 5000); 
            }
        } else if (connection === 'open') {
            console.log('✅ Successfully connected to WhatsApp! Bot is Ready.');
        }
    });

    // 3. Credentials (ලොග් වීම් තොරතුරු) ඉතිරි කිරීම (Save)
    sock.ev.on('creds.update', saveCreds);

    // --- Core Function: ALL Chats Auto Delete Messages ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            // System messages සහ Bot එකෙන් යවන messages මගහැරීම
            if (!msg.key.fromMe && msg.key.remoteJid) {
                try {
                    // පණිවිඩය ලැබුණු වහාම එය 'Delete for Me' කිරීම
                    await sock.chatModify({
                        delete: 'messages', 
                        messages: [msg.key] 
                    }, msg.key.remoteJid);

                } catch (error) {
                    // දෝෂයක් ආවත් Bot එක නතර නොවේ
                }
            }
        }
    });
};

startBot();
