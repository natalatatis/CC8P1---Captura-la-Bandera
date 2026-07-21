import * as THREE from 'three';

export class Player {
    constructor(id, isLocal = false) {
        this.id = id;
        this.isLocal = isLocal;
        
        // Visual mesh: Sphere matching player radius 15
        const geometry = new THREE.SphereGeometry(15, 32, 32);
        const material = new THREE.MeshBasicMaterial({ 
            color: this.isLocal ? 0x00ff00 : 0xff0000 // Green for local, Red for others
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        
        // Current logical coordinates
        this.x = 500;
        this.y = 500;
    }

    // Update logical position received from server and translate to Three.js coordinates
    updatePosition(logicalX, logicalY, sceneManager) {
        this.x = logicalX;
        this.y = logicalY;
        sceneManager.updateObjectPosition(this.mesh, this.x, this.y);
    }
}