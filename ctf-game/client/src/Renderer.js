import * as THREE from 'three';

export class GameRenderer {
    constructor() {
        // Map logical coordinate (0-1000) to Three.js coordinate space
        // Using -500 to 500 makes the center (0,0) of the Three.js scene
        this.scale = 0.01; // Optional: Adjust size
    }

    // Convert Protocol logical units to Three.js positions
    toThreeCoords(logicalX, logicalY) {
        return {
            x: (logicalX - 500), // Center (500,500) becomes (0,0)
            y: -(logicalY - 500) // Flip Y because protocol Y grows downward
        };
    }
}