import * as THREE from 'three';

export class SceneManager {
    constructor() {
        this.scene = new THREE.Scene();

        // Sunset sky
        this.scene.background = new THREE.Color(0xf4a261);

        // Soft sunset fog
        this.scene.fog = new THREE.Fog(0xf4a261, 1200, 2500);

        // Setting up the camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            3000
        );

        this.camera.position.set(0, 700, 700); // Positioned above the center
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true
        });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;

        document.body.appendChild(this.renderer.domElement);

        // Lighting
        this.addLights();

        // Build the map
        this.addMapVisuals();

        // Handle resizing
        window.addEventListener("resize", () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    // Function that maps the units used in the protocol into Three.js coordinates
    // Protocol origin is (0, 0) on the top-left, Scene center (0 ,0)
    toThreeCoords(logicalX, logicalY) {
        return {
            x: logicalX - 500,
            y: 0,
            z: -(logicalY - 500) // Y in protocol is Z in 3D, and Y grows downward
        };
    }

    // Add sunset lighting
    addLights() {

        const ambientLight = new THREE.AmbientLight(0xffddb3, 0.8);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffb347, 1.8);
        sunLight.position.set(-700, 800, 400);

        sunLight.castShadow = true;

        this.scene.add(sunLight);

        // Decorative sun
        const sun = new THREE.Mesh(
            new THREE.SphereGeometry(60, 32, 32),
            new THREE.MeshBasicMaterial({
                color: 0xffd54f
            })
        );

        sun.position.set(-800, 700, -1200);

        this.scene.add(sun);
    }

    // Create a simple tree
    createTree(x, z) {

        // Tree trunk
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(3, 4, 20, 8),
            new THREE.MeshStandardMaterial({
                color: 0x6d4c41
            })
        );

        trunk.position.set(x, 10, z);

        // Leaves
        const leaves = new THREE.Mesh(
            new THREE.ConeGeometry(12, 28, 12),
            new THREE.MeshStandardMaterial({
                color: 0x2e7d32
            })
        );

        leaves.position.set(x, 32, z);

        this.scene.add(trunk);
        this.scene.add(leaves);
    }

    // Draw map
    addMapVisuals() {

        // 1. Draw the Map Boundary (1000x1000)
        const geometry = new THREE.PlaneGeometry(1000, 1000);

        const material = new THREE.MeshStandardMaterial({
            color: 0x5a8f3d
        });

        const map = new THREE.Mesh(geometry, material);

        map.rotation.x = -Math.PI / 2;

        map.receiveShadow = true;

        this.scene.add(map);

        // 2. Draw the Central Circle (radius 300)
        const circleGeo = new THREE.RingGeometry(295, 300, 64);

        const circleMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide
        });

        const circle = new THREE.Mesh(circleGeo, circleMat);

        circle.rotation.x = -Math.PI / 2;

        circle.position.y = 1;

        this.scene.add(circle);

        // Draw border around the map
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x444444
        });

        const createWall = (x, z, width, depth) => {

            const wall = new THREE.Mesh(
                new THREE.BoxGeometry(width, 15, depth),
                wallMaterial
            );

            wall.position.set(x, 7.5, z);

            this.scene.add(wall);

        };

        createWall(0, -500, 1000, 5);
        createWall(0, 500, 1000, 5);
        createWall(-500, 0, 5, 1000);
        createWall(500, 0, 5, 1000);

        // Trees surrounding the map

        for (let x = -650; x <= 650; x += 45) {

            this.createTree(x, -560);
            this.createTree(x, 560);

        }

        for (let z = -520; z <= 520; z += 45) {

            this.createTree(-560, z);
            this.createTree(560, z);

        }

        // Random forest outside the playable area

        for (let i = 0; i < 200; i++) {

            let x, z;

            do {

                x = Math.random() * 2400 - 1200;
                z = Math.random() * 2400 - 1200;

            } while (
                x > -540 &&
                x < 540 &&
                z > -540 &&
                z < 540
            );

            this.createTree(x, z);

        }

        // Add a large ground outside the playable area
        const outerGround = new THREE.Mesh(
            new THREE.PlaneGeometry(3000, 3000),
            new THREE.MeshStandardMaterial({
                color: 0x4b6f2d
            })
        );

        outerGround.rotation.x = -Math.PI / 2;
        outerGround.position.y = -3;

        this.scene.add(outerGround);

        // Keep the playable map above the outer ground
        map.position.y = 0;
    }

    // Update the position
    updateObjectPosition(mesh, logicalX, logicalY) {

        const pos = this.toThreeCoords(logicalX, logicalY);

        mesh.position.set(pos.x, 1, pos.z);

    }

    render(scene) {

        try {

            this.renderer.render(scene, this.camera);

        } catch (error) {

            console.error("Rendering error:", error);

        }

    }
}