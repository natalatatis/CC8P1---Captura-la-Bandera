export class MessageParser {
    constructor() {
        this.buffer = '';
    }

    // Feed incoming data chunks and return an array of fully parsed message objects
    feed(chunk) {
        this.buffer += chunk.toString('utf8');
        const messages = [];
        
        let newlineIndex;
        while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
            const rawMessage = this.buffer.slice(0, newlineIndex).trim();
            this.buffer = this.buffer.slice(newlineIndex + 1);

            if (rawMessage.length > 0) {
                try {
                    const parsed = JSON.parse(rawMessage);
                    messages.push(parsed);
                } catch (e) {
                    messages.push({ type: 'error', reason: 'INVALID_JSON' });
                }
            }
        }
        return messages;
    }
}