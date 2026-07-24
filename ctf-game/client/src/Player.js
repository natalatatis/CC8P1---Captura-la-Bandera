import * as THREE from 'three';

const LOCAL_COLOR = 0x00ff00;   // green — the player controlling this client
const OTHER_COLOR = 0x37474f;   // dark slate — every other connected player

function makeNameSprite(name) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Outline for legibility against any background.
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.strokeText(name, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(60, 15, 1);
    sprite.position.set(0, 35, 0); // floats above the player's sphere
    sprite.renderOrder = 999;

    return sprite;
}

export class Player {
    constructor(id, isLocal = false, name = '') {
        this.id = id;
        this.isLocal = isLocal;
        this.name = name;

        // Visual mesh: Sphere matching player radius 15
        const geometry = new THREE.SphereGeometry(15, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: this.isLocal ? LOCAL_COLOR : OTHER_COLOR
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;

        this.nameSprite = null;
        this.setName(name);

        // Current logical coordinates
        this.x = 500;
        this.y = 500;
    }

    // (Re)builds the floating nametag. Cheap enough to call whenever the
    // name becomes known/changes (e.g. once the 'lobby' broadcast arrives).
    setName(name) {
        if (!name || name === this.name && this.nameSprite) return;
        this.name = name;

        if (this.nameSprite) {
            this.mesh.remove(this.nameSprite);
            this.nameSprite.material.map.dispose();
            this.nameSprite.material.dispose();
        }

        if (name) {
            this.nameSprite = makeNameSprite(name);
            this.mesh.add(this.nameSprite);
        }
    }

    // Update logical position received from server and translate to Three.js coordinates
    updatePosition(logicalX, logicalY, sceneManager) {
        this.x = logicalX;
        this.y = logicalY;
        sceneManager.updateObjectPosition(this.mesh, this.x, this.y);
    }
}