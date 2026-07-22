import * as THREE from 'three';

export class Flag {
    constructor() {
        this.mesh = new THREE.Group();

        //  Flag Pole
        const poleGeometry = new THREE.CylinderGeometry(1.5, 1.5, 40, 8);
        const poleMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x888888,
            roughness: 0.3,
            metalness: 0.8
        });
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.y = 20; // Height offset from the base
        pole.castShadow = true;
        this.mesh.add(pole);

        //  Flag Banner
        const bannerGeometry = new THREE.BoxGeometry(20, 12, 2);
        this.bannerMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xeab308, // Gold / Yellow for free flag
            roughness: 0.4,
            emissive: 0x332200
        });
        const banner = new THREE.Mesh(bannerGeometry, this.bannerMaterial);
        banner.position.set(10, 32, 0); // Positioned near the top of the pole
        banner.castShadow = true;
        this.mesh.add(banner);
    }

    // Update flag position using SceneManager's coordinate mapping function
    update(logicalX, logicalY, ownerId, sceneManager) {
        const pos = sceneManager.toThreeCoords(logicalX, logicalY);
        this.mesh.position.set(pos.x, 0, pos.z);

        // Change banner appearance if someone is carrying it
        if (ownerId !== null) {
            this.bannerMaterial.color.setHex(0x3b82f6); // Blue when carried
            this.bannerMaterial.emissive.setHex(0x1e3a8a);
        } else {
            this.bannerMaterial.color.setHex(0xeab308); // Gold when free
            this.bannerMaterial.emissive.setHex(0x332200);
        }
    }
}