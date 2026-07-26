export class InputHandler {
    constructor(onInteract = () => {}) {
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false
        };
        this.onInteract = onInteract;

        window.addEventListener('keydown', (e) => this.handleKey(e, true));
        window.addEventListener('keyup', (e) => this.handleKey(e, false));
    }

    handleKey(e, isDown) {
        switch (e.key.toLowerCase()) {
            case 'w': case 'arrowup': this.keys.w = isDown; e.preventDefault(); break;
            case 'a': case 'arrowleft': this.keys.a = isDown; e.preventDefault(); break;
            case 's': case 'arrowdown': this.keys.s = isDown; e.preventDefault(); break;
            case 'd': case 'arrowright': this.keys.d = isDown; e.preventDefault(); break;
            case 'e': case ' ':
                e.preventDefault();
                if (isDown) this.onInteract();
                break;
        }
    }

    // Returns the raw direction intent as required by the protocol: each
    // axis is strictly -1, 0, or 1 (section 2.3.2 / 6.3). Diagonal
    // normalization is the SERVER's job (section 4.1) — sending pre-divided
    // fractional values like 0.707 would violate the "estrictamente enteros"
    // rule and get rejected with INVALID_FIELD.
    getDirection() {
        let dx = 0;
        let dy = 0;

        if (this.keys.w) dy -= 1; // Y decreases upward in logical space
        if (this.keys.s) dy += 1; // Y increases downward
        if (this.keys.a) dx -= 1;
        if (this.keys.d) dx += 1;

        return { x: dx, y: dy };
    }
}