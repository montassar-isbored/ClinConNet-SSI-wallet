// pages-js/messages.js
const mediationStatusDiv = document.getElementById('mediationStatus');
const requestMediationBtn = document.getElementById('requestMediationBtn');
const pickupMessagesBtn = document.getElementById('pickupMessagesBtn');
const messageListUl = document.getElementById('messageList');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const recipientDidInput = document.getElementById('recipientDid');
const messageBodyInput = document.getElementById('messageBody');

function displayMessages(messages = []) {
    messageListUl.innerHTML = '';
    if (messages.length === 0) {
        messageListUl.innerHTML = '<li>No messages in history.</li>';
    } else {
        messages.forEach(msg => {
            const li = document.createElement('li');
            
            // Check if the message is a consent request
            if (msg.type === 'https://clinconnet.com/protocols/consent/1.0/request') {
                const viewButton = document.createElement('button');
                viewButton.textContent = 'View Consent Form';
                viewButton.className = 'button-primary';
                // Pass the unique message ID to the form page
                viewButton.onclick = () => {
                    chrome.tabs.create({ url: `pages/form-display.html?messageId=${msg.id}` });
                };
                li.innerHTML = `<p><strong>New Consent Request Received</strong><br><small>From: ${msg.from}</small></p>`;
                li.appendChild(viewButton);
            } else {
                // For all other messages, display the raw JSON
                const pre = document.createElement('pre');
                pre.textContent = JSON.stringify(msg, null, 2);
                li.appendChild(pre);
            }
            messageListUl.appendChild(li);
        });
    }
}

async function loadAndDisplayMessages() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_MESSAGES' });
        if (response?.success) {
            displayMessages(response.messages);
        } else {
            throw new Error(response?.error || 'Could not load messages');
        }
    } catch (e) {
        messageListUl.innerHTML = `<li>Error loading messages: ${e.message}</li>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadAndDisplayMessages();
});

if (requestMediationBtn) {
    requestMediationBtn.addEventListener('click', async () => {
        mediationStatusDiv.textContent = 'Sending mediation request...';
        try {
            const response = await chrome.runtime.sendMessage({ type: 'REQUEST_MEDIATION' });
            mediationStatusDiv.textContent = response?.success ? 'Mediation successful!' : `Failed: ${response?.error}`;
        } catch (e) {
            mediationStatusDiv.textContent = `Error: ${e.message}`;
        }
    });
}

if (pickupMessagesBtn) {
    pickupMessagesBtn.addEventListener('click', async () => {
        mediationStatusDiv.textContent = 'Checking for new messages...';
        try {
            const response = await chrome.runtime.sendMessage({ type: 'PICKUP_MESSAGES' });
            if (response?.success) {
                mediationStatusDiv.textContent = `Found ${response.count} new message(s). Refreshing history.`;
                await loadAndDisplayMessages();
            } else {
                throw new Error(response?.error);
            }
        } catch (e) {
            mediationStatusDiv.textContent = `Pickup failed: ${e.message}`;
        }
    });
}

if (sendMessageBtn) {
    sendMessageBtn.addEventListener('click', async () => {
        const recipientDid = recipientDidInput.value;
        const messageBody = messageBodyInput.value;

        if (!recipientDid || !messageBody) {
            alert('Please provide a recipient DID and a message.');
            return;
        }

        mediationStatusDiv.textContent = 'Sending message...';
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'SEND_MESSAGE',
                payload: {
                    to: recipientDid,
                    body: messageBody
                }
            });

            if (response.success) {
                mediationStatusDiv.textContent = 'Message sent successfully!';
                recipientDidInput.value = '';
                messageBodyInput.value = '';
            } else {
                throw new Error(response.error || 'Unknown error');
            }
        } catch (e) {
            mediationStatusDiv.textContent = `Send failed: ${e.message}`;
        }
    });
}