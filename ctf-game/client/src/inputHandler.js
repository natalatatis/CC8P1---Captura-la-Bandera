export class InputHandler {
    constructor() {
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false
        };

        window.addEventListener('keydown', (e) => this.handleKey(e, true));
        window.addEventListener('keyup', (e) => this.handleKey(e, false));
    }

    handleKey(e, isDown) {
        switch (e.key.toLowerCase()) {
            case 'w': case 'arrowup': this.keys.w = isDown; break;
            case 'a': case 'arrowleft': this.keys.a = isDown; break;
            case 's': case 'arrowdown': this.keys.s = isDown; break;
            case 'd': case 'arrowright': this.keys.d = isDown; break;
        }
    }

    // Returns the normalized direction vector required by the protocol
    getDirection() {
        let dx = 0;
        let dy = 0;

        if (this.keys.w) dy -= 1; // Y decreases upward in logical space
        if (this.keys.s) dy += 1; // Y increases downward
        if (this.keys.a) dx -= 1;
        if (this.keys.d) dx += 1;

        // Prevent diagonal speed boosting via normalization
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag > 0) {
            dx /= mag;
            dy /= mag;
        }

        return { x: dx, y: dy };
    }
}