import { SceneManager } from './SceneManager.js';
import * as THREE from 'three';

const manager = new SceneManager();
const scene = manager.scene;

// Basic Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 5, 5);
scene.add(light);

// Placeholder: Add a Cube (Player)
const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
const player = new THREE.Mesh(geometry, material);
scene.add(player);

function animate() {
    requestAnimationFrame(animate);
    player.rotation.x += 0.01;
    manager.render(scene);
}

// Robust Error Handling for initialization
try {
    animate();
} catch (err) {
    console.error("Game loop failed to start:", err);
}