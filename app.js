// DOM Elements
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const transcriptionContent = document.getElementById('transcription-content');
const transcriptionList = document.getElementById('transcription-list');
const navButtons = document.querySelectorAll('.nav-btn');
const pages = document.querySelectorAll('.page');
const docTitle = document.getElementById('doc-title');
const docContent = document.getElementById('doc-content');
const docSummary = document.getElementById('doc-summary');
const saveDocBtn = document.getElementById('save-doc-btn');
const deleteDocBtn = document.getElementById('delete-doc-btn');
const shareDocBtn = document.getElementById('share-doc-btn');
const backBtn = document.getElementById('back-btn');
const shareModal = document.getElementById('share-modal');
const closeModal = document.querySelector('.close-modal');
const shareBtns = document.querySelectorAll('.share-btn');
const sourceLanguageSelect = document.getElementById('source-language');
const targetLanguageSelect = document.getElementById('target-language');

// App State
let isRecording = false;
let recognition = null;
let currentTranscription = '';
let currentTranslation = '';
let currentDocId = null;
let transcriptions = JSON.parse(localStorage.getItem('transcriptions')) || [];
let lastTranslationText = '';
let translationTimeout = null;
let lastSpeechTime = 0; // Track when the last speech was detected
let pauseDetected = false; // Flag to track if a pause was detected
let lineTimestamps = []; // Array to store timestamps for each line

// OpenAI API Key - This should be securely stored in a production environment
// For this demo, we'll use a placeholder that will be replaced by the user
let OPENAI_API_KEY = 'your-openai-api-key';

// Initialize the app
function initApp() {
    // Check for browser support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('Your browser does not support speech recognition. Please use Chrome, Edge, or Safari.');
        startBtn.disabled = true;
        return;
    }

    // Set up event listeners
    setupEventListeners();
    
    // Render saved transcriptions
    renderTranscriptionList();
    
    // Ask for API key if not set
    if (localStorage.getItem('openai_api_key')) {
        OPENAI_API_KEY = localStorage.getItem('openai_api_key');
    } else {
        setTimeout(() => {
            const apiKey = prompt('Please enter your OpenAI API key:');
            if (apiKey) {
                OPENAI_API_KEY = apiKey;
                localStorage.setItem('openai_api_key', apiKey);
            }
        }, 1000);
    }

    // Load language preferences if saved
    if (localStorage.getItem('source_language')) {
        sourceLanguageSelect.value = localStorage.getItem('source_language');
    }
    if (localStorage.getItem('target_language')) {
        targetLanguageSelect.value = localStorage.getItem('target_language');
    }
}

// Set up event listeners
function setupEventListeners() {
    // Navigation
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPage = btn.dataset.page;
            navigateToPage(targetPage);
        });
    });

    // Transcription controls
    startBtn.addEventListener('click', startTranscription);
    stopBtn.addEventListener('click', stopTranscription);

    // Document actions
    saveDocBtn.addEventListener('click', saveDocument);
    deleteDocBtn.addEventListener('click', deleteDocument);
    shareDocBtn.addEventListener('click', showShareModal);
    backBtn.addEventListener('click', () => navigateToPage('library'));

    // Modal
    closeModal.addEventListener('click', hideShareModal);
    window.addEventListener('click', (e) => {
        if (e.target === shareModal) hideShareModal();
    });

    // Share buttons
    shareBtns.forEach(btn => {
        btn.addEventListener('click', () => shareDocument(btn.dataset.type));
    });

    // Language selection
    sourceLanguageSelect.addEventListener('change', () => {
        localStorage.setItem('source_language', sourceLanguageSelect.value);
    });
    
    targetLanguageSelect.addEventListener('change', () => {
        localStorage.setItem('target_language', targetLanguageSelect.value);
        // If we have current transcription, translate it again with new target language
        if (currentTranscription.trim() && isRecording) {
            translateText(currentTranscription);
        }
    });
}

// Navigation function
function navigateToPage(pageName) {
    // Update navigation buttons
    navButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === pageName);
    });

    // Show the selected page
    pages.forEach(page => {
        const isActive = page.id === `${pageName}-page`;
        page.classList.toggle('active', isActive);
    });
}

// Start transcription
function startTranscription() {
    if (isRecording) return;

    // Initialize speech recognition
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = sourceLanguageSelect.value; // Use selected source language

    // Clear previous content
    transcriptionContent.innerHTML = '';
    currentTranscription = '';
    currentTranslation = '';
    lastSpeechTime = Date.now(); // Track when the last speech was detected

    // Update UI
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    stopBtn.classList.add('recording');
    isRecording = true;

    // Handle results
    recognition.onresult = (event) => {
        const now = Date.now();
        const timeSinceLastSpeech = now - lastSpeechTime;
        lastSpeechTime = now; // Update the last speech time
        
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }

        // Check if there was a significant pause (more than 5 seconds)
        if (timeSinceLastSpeech > 5000 && currentTranscription.trim() && (finalTranscript || interimTranscript)) {
            // If there was a significant pause, add a newline to separate content
            currentTranscription += '\n';
            pauseDetected = true;
            // Reset translation context to force a new translation
            lastTranslationText = '';
            
            // Add a new timestamp for this line after pause
            const timestamp = new Date();
            lineTimestamps.push(timestamp);
        } else if (finalTranscript) {
            // Always update timestamp for the current line when we get new final text
            const currentLineIndex = currentTranscription.split('\n').length - 1;
            
            // If we don't have a timestamp for this line yet, add one
            if (currentLineIndex >= lineTimestamps.length) {
                lineTimestamps.push(new Date());
            } else {
                // Update the timestamp for the current line
                lineTimestamps[currentLineIndex] = new Date();
            }
        }
        
        // Update the transcription content
        if (finalTranscript) {
            currentTranscription += finalTranscript;
        }
        
        // Check if we need translation
        const needsTranslation = sourceLanguageSelect.value.substring(0, 2) !== targetLanguageSelect.value;
        
        // Always show the current state immediately
        // If translation is needed, show with isTranslating=true to display loading indicator
        updateTranscriptionDisplay(currentTranscription, interimTranscript, needsTranslation);
        
        // Request translation if languages are different and we have content to translate
        if (needsTranslation && (currentTranscription.trim() || interimTranscript.trim())) {
            // Then request translation in the background with reduced delay
            translateText(currentTranscription + (interimTranscript ? ' ' + interimTranscript : ''));
        }
    };

    // Handle errors
    recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        stopTranscription();
        alert(`Error occurred: ${event.error}`);
    };

    // Start listening
    recognition.start();
}

// Stop transcription
function stopTranscription() {
    if (!isRecording) return;

    // Stop recognition
    if (recognition) {
        recognition.stop();
        recognition = null;
    }

    // Update UI
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    stopBtn.classList.remove('recording');
    isRecording = false;

    // Process the final transcription
    if (currentTranscription.trim()) {
        processTranscription(currentTranscription, currentTranslation);
    }
}

// Update the transcription display
function updateTranscriptionDisplay(finalText, interimText = '', isTranslating = false) {
    // Don't update if we're not recording and processTranscription has been called
    // This prevents overwriting the post-transcription options
    if (!isRecording && currentDocId) {
        return;
    }
    
    // Check if we need to show translation (if languages are different)
    const needsTranslation = sourceLanguageSelect.value.substring(0, 2) !== targetLanguageSelect.value;
    
    if (needsTranslation) {
        // Split text into lines for line-by-line display
        const originalLines = finalText.split(/\n/).filter(line => line.trim().length > 0);
        let translatedLines = [];
        
        if (currentTranslation) {
            translatedLines = currentTranslation.split(/\n/).filter(line => line.trim().length > 0);
        }
        
        // Create line-by-line display
        let lineByLineContent = '';
        
        // Handle case where we have different number of lines
        const maxLines = Math.max(originalLines.length, translatedLines.length);
        
        // Ensure we have enough timestamps for all lines
        while (lineTimestamps.length < maxLines) {
            lineTimestamps.push(new Date());
        }
        
        for (let i = 0; i < maxLines; i++) {
            const originalLine = i < originalLines.length ? originalLines[i] : '';
            let translatedLine = i < translatedLines.length ? translatedLines[i] : '';
            
            // If this is the last line and we're translating, show a loading indicator
            if (i === maxLines - 1 && isTranslating && originalLine && !translatedLine) {
                translatedLine = '翻译中...';
            }
            
            // Use stored timestamp for this line
            const timestamp = lineTimestamps[i];
            const hours = timestamp.getHours().toString().padStart(2, '0');
            const minutes = timestamp.getMinutes().toString().padStart(2, '0');
            const seconds = timestamp.getSeconds().toString().padStart(2, '0');
            const formattedTimestamp = `${hours}:${minutes}:${seconds}`;
            
            lineByLineContent += `
                <div class="translation-line-pair">
                    <div class="original-line">${originalLine}</div>
                    <div class="translated-line">[${formattedTimestamp}] ${translatedLine}</div>
                </div>
            `;
        }
        
        // If we have interim text that hasn't been translated yet, add it with a loading indicator
        if (interimText && needsTranslation) {
            // Use current time for interim text
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
            const timestamp = `${hours}:${minutes}:${seconds}`;
            
            lineByLineContent += `
                <div class="translation-line-pair">
                    <div class="original-line">${interimText}</div>
                    <div class="translated-line">[${timestamp}] 翻译中...</div>
                </div>
            `;
            interimText = ''; // Clear interim text since we've already displayed it
        }
        
        // Show split view with original and translation
        transcriptionContent.innerHTML = `
            <div class="transcription-split-view">
                <div class="transcription-pane">
                    <div class="transcription-pane-header">Original (${sourceLanguageSelect.options[sourceLanguageSelect.selectedIndex].text})</div>
                    <div class="line-by-line-container">${lineByLineContent}</div>
                    <div class="transcription-highlight">${interimText}</div>
                </div>
            </div>
        `;
    } else {
        // Format the text with paragraphs for single language display
        const formattedText = finalText
            .replace(/\n/g, '<br>')
            .replace(/\. /g, '.<br><br>');
            
        // Show only original text if no translation needed or available
        transcriptionContent.innerHTML = `
            <div>${formattedText}</div>
            <div class="transcription-highlight">${interimText}</div>
        `;
    }

    // Scroll to the bottom
    transcriptionContent.scrollTop = transcriptionContent.scrollHeight;
}

// Translate text using OpenAI
async function translateText(text) {
    // Don't translate if it's the same text we just translated
    if (text === lastTranslationText) return;
    
    // Determine if we need to translate only the new part
    let textToTranslate = text;
    let isAppendMode = false;
    
    if (lastTranslationText && text.startsWith(lastTranslationText)) {
        // Only translate the new part if the current text starts with the previously translated text
        textToTranslate = text.substring(lastTranslationText.length);
        isAppendMode = true;
        
        // If there's nothing new to translate, just return
        if (!textToTranslate.trim()) return;
    }
    
    // Save the full text we're translating to avoid duplicate requests
    lastTranslationText = text;
    
    // Clear any pending translation requests
    if (translationTimeout) {
        clearTimeout(translationTimeout);
    }
    
    // Add a smaller delay to improve translation speed
    const delayTime = pauseDetected ? 100 : 300; // Use even shorter delay if pause detected
    
    // If pause was detected, we need to ensure the translation respects the line breaks
    // and we need to add a new timestamp for the new line
    if (pauseDetected) {
        // If we're in append mode and there's a pause, we should add a newline to the translation too
        if (isAppendMode && currentTranslation) {
            currentTranslation += '\n';
        }
        pauseDetected = false; // Reset the pause flag
    }
    
    // Immediately show the current state with a loading indicator
    if (isRecording) {
        // Extract any interim text that might be at the end of the full text
        const parts = text.split(currentTranscription);
        const interimText = parts.length > 1 ? parts[1].trim() : '';
        
        // Update display with isTranslating=true to show loading indicator
        updateTranscriptionDisplay(currentTranscription, interimText, true);
    }
    
    translationTimeout = setTimeout(async () => {
        try {
            if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key') {
                throw new Error('OpenAI API key not set');
            }

            const sourceLanguage = sourceLanguageSelect.options[sourceLanguageSelect.selectedIndex].text;
            const targetLanguage = targetLanguageSelect.options[targetLanguageSelect.selectedIndex].text;
            
            // Split text into lines for line-by-line translation
            const lines = textToTranslate.split(/\n|\. /).filter(line => line.trim().length > 0);
            
            // If there's only one short phrase, translate directly without embellishment
            if (lines.length <= 1 && textToTranslate.split(' ').length < 10) {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${OPENAI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "system",
                                content: `You are a real-time translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}. Translate EXACTLY what is provided, word for word. Do not add any additional content, context, or embellishment. Only respond with the direct translation, nothing else.`
                            },
                            {
                                role: "user",
                                content: textToTranslate
                            }
                        ]
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
                }

                const data = await response.json();
                const newTranslation = data.choices[0].message.content;
                
                // If in append mode, add the new translation to the existing one on a new line
                if (isAppendMode && currentTranslation) {
                    currentTranslation = currentTranslation + '\n' + newTranslation;
                } else {
                    currentTranslation = newTranslation;
                }
            } else {
                // For longer content, translate with more context preservation
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${OPENAI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "system",
                                content: `You are a real-time translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}. Maintain the original meaning, tone, and structure. Preserve line breaks and paragraph structure. Only respond with the translated text, nothing else.`
                            },
                            {
                                role: "user",
                                content: textToTranslate
                            }
                        ]
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
                }

                const data = await response.json();
                const newTranslation = data.choices[0].message.content;
                
                // If in append mode, add the new translation to the existing one on a new line
                if (isAppendMode && currentTranslation) {
                    currentTranslation = currentTranslation + '\n' + newTranslation;
                } else {
                    currentTranslation = newTranslation;
                }
            }
            
            // Update the display with both original and translation
            // Only update if we're still recording or if this is the final translation
            if (isRecording || !recognition) {
                updateTranscriptionDisplay(currentTranscription, '');
            }
        } catch (error) {
            console.error('Translation error:', error);
            // Fall back to original text if translation fails
            if (isRecording || !recognition) {
                updateTranscriptionDisplay(currentTranscription);
            }
        }
    }, delayTime); // Use dynamic delay based on whether a pause was detected
}

// Process the transcription with OpenAI
async function processTranscription(text, translatedText = '') {
    try {
        // Show loading state
        transcriptionContent.innerHTML = '<p>Processing transcription...</p>';

        // Generate a title and summary using OpenAI
        const { title, formattedText, summary } = await generateTitleAndSummary(
            translatedText || text, 
            sourceLanguageSelect.value.substring(0, 2), 
            targetLanguageSelect.value
        );

        // Create a new document
        const newDoc = {
            id: Date.now().toString(),
            title: title,
            content: formattedText,
            summary: summary,
            date: new Date().toISOString(),
            rawText: text,
            translatedText: translatedText,
            sourceLanguage: sourceLanguageSelect.value,
            targetLanguage: targetLanguageSelect.value
        };

        // Set as current document
        currentDocId = newDoc.id;

        // Show post-transcription options instead of directly navigating to document page
        showPostTranscriptionOptions(newDoc);
    } catch (error) {
        console.error('Error processing transcription:', error);
        alert('Error processing transcription. Please try again.');
        
        // Fallback to raw text
        const newDoc = {
            id: Date.now().toString(),
            title: `Meeting ${new Date().toLocaleDateString()}`,
            content: translatedText || text,
            summary: 'Summary could not be generated.',
            date: new Date().toISOString(),
            rawText: text,
            translatedText: translatedText,
            sourceLanguage: sourceLanguageSelect.value,
            targetLanguage: targetLanguageSelect.value
        };
        
        currentDocId = newDoc.id;
        showPostTranscriptionOptions(newDoc);
    }
}

// Show post-transcription options
function showPostTranscriptionOptions(doc) {
    // Create a preview of the document in the transcription content area
    let contentPreview = '';
    
    // Check if we have both original and translated text
    if (doc.rawText && doc.translatedText && doc.sourceLanguage !== doc.targetLanguage) {
        // Split text into lines for line-by-line display
        const originalLines = doc.rawText.split(/\n|\. /).filter(line => line.trim().length > 0);
        const translatedLines = doc.translatedText.split(/\n|\. /).filter(line => line.trim().length > 0);
        
        // Create line-by-line display (limited to first few lines for preview)
        let lineByLineContent = '';
        
        // Handle case where we have different number of lines
        const maxLines = Math.min(5, Math.max(originalLines.length, translatedLines.length)); // Limit to 5 lines for preview
        
        for (let i = 0; i < maxLines; i++) {
            const originalLine = i < originalLines.length ? originalLines[i] : '';
            const translatedLine = i < translatedLines.length ? translatedLines[i] : '';
            
            lineByLineContent += `
                <div class="translation-line-pair">
                    <div class="original-line">${originalLine}</div>
                    <div class="translated-line">${translatedLine}</div>
                </div>
            `;
        }
        
        // Show split view with original and translation
        contentPreview = `
            <div class="transcription-split-view">
                <div class="transcription-pane">
                    <div class="transcription-pane-header">Original (${doc.sourceLanguage})</div>
                    <div class="line-by-line-container">${lineByLineContent}</div>
                </div>
            </div>
        `;
        
        // Add ellipsis if there are more lines
        if (originalLines.length > 5 || translatedLines.length > 5) {
            contentPreview += '<div class="preview-ellipsis">...</div>';
        }
    } else {
        // Use the existing content if no translation is available
        contentPreview = `<div class="preview-content">${doc.content.substring(0, 300)}${doc.content.length > 300 ? '...' : ''}</div>`;
    }
    
    transcriptionContent.innerHTML = `
        <div class="post-transcription-preview">
            <div class="post-transcription-actions">
                <button id="edit-transcription-btn" class="secondary-btn">Edit</button>
                <button id="save-transcription-btn" class="primary-btn">Save</button>
                <button id="discard-transcription-btn" class="secondary-btn danger">Discard</button>
            </div>
            <h3>${doc.title}</h3>
            ${contentPreview}
        </div>
    `;
    
    // Add event listeners to the buttons
    document.getElementById('edit-transcription-btn').addEventListener('click', () => {
        showDocument(doc);
    });
    
    document.getElementById('save-transcription-btn').addEventListener('click', () => {
        // Add to transcriptions array
        transcriptions.push(doc);
        
        // Save to local storage
        localStorage.setItem('transcriptions', JSON.stringify(transcriptions));
        
        // Update the list and navigate to library
        renderTranscriptionList();
        navigateToPage('library');
        
        // Reset current document
        currentDocId = null;
        currentTranscription = '';
        currentTranslation = '';
    });
    
    document.getElementById('discard-transcription-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to discard this transcription?')) {
            // Reset current document
            currentDocId = null;
            currentTranscription = '';
            currentTranslation = '';
            
            // Clear transcription content
            transcriptionContent.innerHTML = '<p class="placeholder">Your transcription will appear here...</p>';
        }
    });
}

// Generate title and summary using OpenAI
async function generateTitleAndSummary(text, sourceLanguageCode, targetLanguageCode) {
    try {
        if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key') {
            throw new Error('OpenAI API key not set');
        }

        // For very short text, don't try to generate a summary or formatted text
        if (text.split(' ').length < 15) {
            return {
                title: `Note: ${new Date().toLocaleDateString()}`,
                formattedText: text,
                summary: 'Text too short for summary generation.'
            };
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are an assistant that helps format transcribed text and generate a title and summary. 
                        The text is in ${targetLanguageCode}. 
                        Format the text into clear paragraphs. 
                        Generate a concise title (max 60 characters) that reflects the content. 
                        Create a brief summary (2-3 sentences) of the key points. 
                        Only use information explicitly stated in the text, do not add any new information or assumptions.
                        Respond in JSON format with the following structure: 
                        { "title": "The title", "formattedText": "The formatted text", "summary": "The summary" }`
                    },
                    {
                        role: "user",
                        content: text
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        // Parse the JSON response
        try {
            const parsedContent = JSON.parse(content);
            return {
                title: parsedContent.title || `Note: ${new Date().toLocaleDateString()}`,
                formattedText: parsedContent.formattedText || text,
                summary: parsedContent.summary || 'Summary not available.'
            };
        } catch (parseError) {
            console.error('Error parsing OpenAI response:', parseError);
            // Fallback to raw text
            return {
                title: `Note: ${new Date().toLocaleDateString()}`,
                formattedText: text,
                summary: 'Summary could not be generated.'
            };
        }
    } catch (error) {
        console.error('Error generating title and summary:', error);
        // Fallback to raw text
        return {
            title: `Note: ${new Date().toLocaleDateString()}`,
            formattedText: text,
            summary: 'Summary could not be generated.'
        };
    }
}

// Show document in the document page
// Show document
function showDocument(doc) {
    // Navigate to document page
    navigateToPage('document');
    
    // Set current document ID
    currentDocId = doc.id;
    
    // Update UI
    docTitle.value = doc.title;
    
    // Check if we have both original and translated text
    if (doc.rawText && doc.translatedText && doc.sourceLanguage !== doc.targetLanguage) {
        // Split text into lines for line-by-line display
        const originalLines = doc.rawText.split(/\n|\. /).filter(line => line.trim().length > 0);
        const translatedLines = doc.translatedText.split(/\n|\. /).filter(line => line.trim().length > 0);
        
        // Create line-by-line display
        let lineByLineContent = '';
        
        // Handle case where we have different number of lines
        const maxLines = Math.max(originalLines.length, translatedLines.length);
        
        for (let i = 0; i < maxLines; i++) {
            const originalLine = i < originalLines.length ? originalLines[i] : '';
            const translatedLine = i < translatedLines.length ? translatedLines[i] : '';
            
            lineByLineContent += `
                <div class="translation-line-pair">
                    <div class="original-line">${originalLine}</div>
                    <div class="translated-line">${translatedLine}</div>
                </div>
            `;
        }
        
        // Show split view with original and translation
        docContent.innerHTML = `
            <div class="transcription-split-view">
                <div class="transcription-pane">
                    <div class="transcription-pane-header">Original (${doc.sourceLanguage})</div>
                    <div class="line-by-line-container">${lineByLineContent}</div>
                </div>
            </div>
        `;
    } else {
        // Use the existing content if no translation is available
        docContent.innerHTML = doc.content;
    }
    
    docSummary.innerHTML = doc.summary;
    
    // Set up delete button
    deleteDocBtn.onclick = () => deleteDocument(doc.id);
    
    // Set up share button
    shareDocBtn.onclick = () => shareDocument(doc);
}

// Save document to library
function saveDocument() {
    if (!currentDocId) return;

    // Get current document data
    const docData = {
        id: currentDocId,
        title: docTitle.value,
        content: docContent.innerHTML,
        summary: docSummary.innerHTML,
        date: new Date().toISOString(),
        rawText: currentTranscription,
        translatedText: currentTranslation,
        sourceLanguage: sourceLanguageSelect.value,
        targetLanguage: targetLanguageSelect.value
    };

    // Check if document already exists
    const existingIndex = transcriptions.findIndex(t => t.id === currentDocId);
    if (existingIndex >= 0) {
        transcriptions[existingIndex] = docData;
    } else {
        transcriptions.push(docData);
    }

    // Save to local storage
    localStorage.setItem('transcriptions', JSON.stringify(transcriptions));

    // Update the list and navigate to library
    renderTranscriptionList();
    navigateToPage('library');

    // Reset current document
    currentDocId = null;
    currentTranscription = '';
    currentTranslation = '';
}

// Delete document
function deleteDocument(docId) {
    if (confirm('Are you sure you want to delete this document?')) {
        // Remove from transcriptions array
        transcriptions = transcriptions.filter(doc => doc.id !== docId);
        
        // Update local storage
        localStorage.setItem('transcriptions', JSON.stringify(transcriptions));
        
        // Navigate back to library
        navigateToPage('library');
        renderTranscriptionList();
        
        // Reset current document
        currentDocId = null;
    }
}

// Render the transcription list
function renderTranscriptionList() {
    if (transcriptions.length === 0) {
        transcriptionList.innerHTML = '<p class="empty-library">No transcriptions saved yet</p>';
        return;
    }

    // Sort by date (newest first)
    const sortedTranscriptions = [...transcriptions].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
    );

    // Generate HTML
    transcriptionList.innerHTML = sortedTranscriptions.map(doc => {
        // Get a meaningful preview of the content
        const previewText = getPreviewText(doc.content);
        
        return `
            <div class="transcription-card" data-id="${doc.id}">
                <h3 class="card-title">${doc.title}</h3>
                <p class="card-date">${formatDate(doc.date)}</p>
                <div class="card-preview">${previewText}</div>
            </div>
        `;
    }).join('');

    // Add click event listeners
    document.querySelectorAll('.transcription-card').forEach(card => {
        card.addEventListener('click', () => {
            const docId = card.dataset.id;
            const doc = transcriptions.find(t => t.id === docId);
            if (doc) {
                currentDocId = docId;
                showDocument(doc);
            }
        });
    });
}

// Format date for display
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Get preview text from HTML content
function getPreviewText(htmlContent) {
    if (!htmlContent) return 'No content available';
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const text = tempDiv.textContent || tempDiv.innerText;
    return text.substring(0, 100) + (text.length > 100 ? '...' : '');
}

// Share document functions
function showShareModal() {
    shareModal.classList.add('active');
}

function hideShareModal() {
    shareModal.classList.remove('active');
}

function shareDocument(type) {
    if (!currentDocId) return;

    const doc = transcriptions.find(t => t.id === currentDocId);
    if (!doc) return;

    switch (type) {
        case 'copy':
            // Create a shareable text version
            const shareText = `${doc.title}\n\n${doc.content.replace(/<[^>]*>/g, '')}\n\nKey Takeaways:\n${doc.summary.replace(/<[^>]*>/g, '')}`;
            
            // Copy to clipboard
            navigator.clipboard.writeText(shareText)
                .then(() => alert('Copied to clipboard!'))
                .catch(err => {
                    console.error('Failed to copy:', err);
                    alert('Failed to copy to clipboard');
                });
            break;
            
        case 'email':
            // Create email content
            const subject = encodeURIComponent(doc.title);
            const body = encodeURIComponent(`${doc.content.replace(/<[^>]*>/g, '')}\n\nKey Takeaways:\n${doc.summary.replace(/<[^>]*>/g, '')}`);
            window.open(`mailto:?subject=${subject}&body=${body}`);
            break;
            
        case 'message':
            // For mobile sharing
            if (navigator.share) {
                navigator.share({
                    title: doc.title,
                    text: `${doc.content.replace(/<[^>]*>/g, '')}\n\nKey Takeaways:\n${doc.summary.replace(/<[^>]*>/g, '')}`
                }).catch(err => console.error('Share failed:', err));
            } else {
                alert('Sharing not supported on this browser');
            }
            break;
    }

    hideShareModal();
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);