# VoiceScribe - Real-time Meeting Transcriber

## Overview
VoiceScribe is a lightweight, browser-based application that provides real-time transcription of meetings or conversations. It's specifically designed to help foreign language learners by providing instant transcription and translation capabilities.

## Features

- **Real-time Transcription**: Capture speech and convert it to text in real-time
- **Document Management**: Save, edit, and organize your transcribed sessions
- **Key Takeaways**: Automatically generate summaries of your meetings using GPT-4o Mini
- **Sharing Options**: Easily share your transcriptions via copy, email, or messaging
- **Responsive Design**: Works on both desktop and mobile devices
- **No Installation Required**: Runs directly in your web browser

## Getting Started

1. Open the application in your web browser at http://localhost:8000
2. You'll be prompted to enter your OpenAI API key (required for the summarization feature)
3. Click the "Start Transcribing" button to begin capturing audio
4. Speak clearly into your microphone
5. Click "Stop Transcribing" when you're done
6. The app will process your transcription and generate a title and summary
7. Edit the document if needed, then click "Save" to store it in your library

## Requirements

- A modern web browser (Chrome, Edge, or Safari recommended)
- Microphone access
- OpenAI API key for the summarization feature

## How to Get an OpenAI API Key

1. Go to [OpenAI's website](https://platform.openai.com/)
2. Sign up or log in to your account
3. Navigate to the API section
4. Create a new API key
5. Copy the key and paste it when prompted in the application

## Privacy Notice

This application processes audio locally on your device. The text is only sent to OpenAI's servers for generating summaries and formatting. Your API key and transcriptions are stored locally in your browser's storage and are not sent to any other servers.

## Customization

You can customize the application by modifying the following files:

- `index.html`: Structure of the application
- `styles.css`: Visual appearance and animations
- `app.js`: Application logic and functionality

## Limitations

- Speech recognition accuracy depends on your browser's implementation and microphone quality
- Requires an internet connection for the summarization feature
- Currently supports English language by default (can be changed in the code)

## Future Enhancements

- Multiple language support
- Real-time translation
- Cloud synchronization
- Collaborative editing
- Custom themes

---

Created with ❤️ to help language learners overcome communication barriers.