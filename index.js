require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const url = require('url');
const destroyer = require('server-destroy');
const { OAuth2Client } = require('google-auth-library');

// Environment variables for Telegram and Google Drive
const token = process.env.TELEGRAM_BOT_TOKEN;
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_PATH = 'token.json';

// Create a bot instance
const bot = new TelegramBot(token, { polling: true });

async function getAuthenticatedClient() {
    const client_secret = process.env.GOOGLE_CLIENT_SECRET;
    const client_id = process.env.GOOGLE_CLIENT_ID;
    const redirect_uris = [process.env.GOOGLE_REDIRECT_URI]; // Ensure it's an array

    const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

    try {
        const token = await fs.readFile(TOKEN_PATH);
        oAuth2Client.setCredentials(JSON.parse(token));
        return oAuth2Client;
    } catch (error) {
        const authorizeUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });

        const server = http.createServer(async (req, res) => {
            if (req.url.indexOf('/oauth2callback') > -1) {
                const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
                const code = qs.get('code');
                res.end('Authentication successful! Please return to the console.');
                server.destroy();
                const { tokens } = await oAuth2Client.getToken(code);
                oAuth2Client.setCredentials(tokens);
                await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
                console.log('Token stored to', TOKEN_PATH);
                return oAuth2Client;
            }
        }).listen(3000, async () => {
            console.log(`Open this URL in your browser to authenticate: ${authorizeUrl}`);

            const open = await import('open');
            open.default(authorizeUrl, { wait: false }).then(cp => cp.unref());
        });
        destroyer(server);
    }
}

async function main() {
    try {
        const auth = await getAuthenticatedClient();
        const drive = google.drive({ version: 'v3', auth });

        console.log('Authentication successful.');

        // Ensure download directory exists
        const downloadDir = './downloads';
        await fs.mkdir(downloadDir, { recursive: true });

        // Handle incoming documents
        bot.on('document', async (msg) => {
            const chatId = msg.chat.id;
            const fileId = msg.document.file_id;
            const fileName = msg.document.file_name;
            const mimeType = msg.document.mime_type;

            try {
                // Get file path
                const filePath = await bot.downloadFile(fileId, downloadDir);

                // Upload file to Google Drive
                const response = await drive.files.create({
                    requestBody: {
                        name: fileName,
                        mimeType: mimeType,
                    },
                    media: {
                        mimeType: mimeType,
                        body: fs.createReadStream(filePath), // Use stream to handle large files
                    },
                });

                bot.sendMessage(chatId, `File uploaded successfully. File ID: ${response.data.id}`);

                // Clean up: delete the local file after upload
                await fs.unlink(filePath);
            } catch (error) {
                console.error('Error:', error);
                bot.sendMessage(chatId, 'An error occurred while uploading the file.');
            }
        });

        console.log('Bot is running...');
    } catch (error) {
        console.error('Error in main function:', error);
    }
}

// Run the bot
main().catch(console.error);