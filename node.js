const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');
const fs = require('fs');

// Replace with your Telegram bot token
const token = 'YOUR_TELEGRAM_BOT_TOKEN';

// Create a bot instance
const bot = new TelegramBot(token, { polling: true });

// Load client secrets from a file
const credentials = require('./credentials.json');

// Configure OAuth2 client
const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

// Set up the Drive API
const drive = google.drive({ version: 'v3', auth: oAuth2Client });

// Handle incoming documents
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name;

    try {
        // Get file path
        const filePath = await bot.downloadFile(fileId, './downloads');

        // Upload file to Google Drive
        const response = await drive.files.create({
            requestBody: {
                name: fileName,
                mimeType: msg.document.mime_type,
            },
            media: {
                mimeType: msg.document.mime_type,
                body: fs.createReadStream(filePath),
            },
        });

        bot.sendMessage(chatId, `File uploaded successfully. File ID: ${response.data.id}`);
    } catch (error) {
        console.error('Error:', error);
        bot.sendMessage(chatId, 'An error occurred while uploading the file.');
    }
});

// Start the bot
bot.on('polling_error', (error) => {
    console.log(error);
});

console.log('Bot is running...');