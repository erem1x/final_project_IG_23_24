import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import CannonDebugger from 'cannon-es-debugger'
import { GLTFLoader } from 'three/examples/jsm/Addons.js'
import * as PROGRESS from 'progressbar.js'

// Setting these variables as global
let scene, camera, renderer;
let world, cannonDebugger;
let timeStep = 1/60; // update rate for the world
let groundMaterial, sideMaterial, carMaterial;

let meshesArray = []; // gathering all additional dynamic items
let bodiesArray = [];

let carBody, carMesh; // car without wheels
let vehicle; // full body of the car
let wheelBody1, wheelBody2, wheelBody3, wheelBody4;
let wheelMesh1, wheelMesh2, wheelMesh3, wheelMesh4;
let maxSteerVal = Math.PI / 8; // steer of the car
let maxForce = 100; // max force on the car
let rampExists = false;

let buttonBody1, buttonBody2;

let chaseCam, chaseCamPilot; // chase camera
let view = new THREE.Vector3(); // world position of the camera


const textureLoader = new THREE.TextureLoader(); // texture loader

// Setup
initScene();
initWorld();
initChaseCam();
createGround(); // create the "earth"
createCar();
createRoof();
createButtons();
createWalls(); // so that the map is limited
animate();



function initScene(){
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.CubeTextureLoader()
    .setPath('./src/')
    .load([
        'posx.jpg',
        'negx.jpg',
        'posy.jpg',
        'negy.jpg',
        'posz.jpg',
        'negz.jpg'
    ]);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);

    // Renderer
    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // color, intensity
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // color, intensity
    directionalLight.position.set(-10, 500, 1000);
    directionalLight.castShadow = true;

    // Set up shadow properties for the light
    directionalLight.shadow.mapSize.width = 4096; // default is 512
    directionalLight.shadow.mapSize.height = 4096; // default is 512
    directionalLight.shadow.camera.near = 1; // default is 0.5
    directionalLight.shadow.camera.far = 2000; // default is 500
    directionalLight.shadow.camera.left = -500;
    directionalLight.shadow.camera.right = 500;
    directionalLight.shadow.camera.top = 500;
    directionalLight.shadow.camera.bottom = -500;

    scene.add(directionalLight);
}

function initChaseCam(){
    chaseCam = new THREE.Object3D();
    chaseCam.position.set(0,0,0);
    chaseCam.rotation.set(0, -Math.PI / 2, 0);

    chaseCamPilot = new THREE.Object3D();
    chaseCamPilot.position.set(0, 8, -20);

    chaseCam.add(chaseCamPilot); // child 

    scene.add(chaseCam);
}



// Cannon.js world
function initWorld(){
    world = new CANNON.World();
    world.gravity.set(0, -9.81, 0);

    cannonDebugger = new CannonDebugger(scene, world, {
        color: 0xffffff,
        scale: 1.0
    });

}


function createGround(){
    groundMaterial = new CANNON.Material("groundMaterial");

    const groundShape = new CANNON.Plane(); // infinite
    const groundBody = new CANNON.Body({
        mass: 0,
        shape: groundShape,
        material: groundMaterial
    });

    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);

    world.addBody(groundBody);

    // texture 
    const groundTexture = textureLoader.load("./textures/texture.jpg");
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(24, 24);

    const groundMat = new THREE.MeshLambertMaterial({
        map: groundTexture,
        color: 0x38761d // dark green
    });
    const groundGeo = new THREE.BoxGeometry(1000, 2, 1000);

    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    scene.add(groundMesh);
    groundMesh.position.set(0, -1, 0);

    groundMesh.receiveShadow = true;
}

function createCar(){
    carMaterial = new CANNON.Material("carMaterial");

    const normalGround = new CANNON.ContactMaterial(groundMaterial, carMaterial, {
        friction: 0.3,
        restitution: 0,
        contactEquationStiffness: 1000
    });

    world.addContactMaterial(normalGround);

    // Shape and 
    const carShape = new CANNON.Box(new CANNON.Vec3(4, 0.5, 2));
    carBody = new CANNON.Body({
        mass: 6,
        material: carMaterial,
        shape: carShape,
        position: new CANNON.Vec3(0,6,0),
    });

    carBody.angularDamping = 0.9; // reduce flipping (NEEDED!)

    carBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);

    vehicle = new CANNON.RigidVehicle({
        chassisBody: carBody
    });

    addWheels();

    vehicle.addToWorld(world);

    const Gloader = new GLTFLoader();
    Gloader.load("./models/scene.gltf", function(gltf){
        carMesh = gltf.scene;
        carMesh.scale.set(3, 3, 3);
        carMesh.position.copy(carBody.position);
        carMesh.quaternion.copy(carBody.quaternion);

        carMesh.add(chaseCam);
        scene.add(carMesh);

        carMesh.traverse(function(node) {
            if(node.isMesh) {node.castShadow = true;}
        });
    });

    createMeshes();

    
}

function addWheels(){
    const mass = 0.5;
    const axisWidth = 5;
    const wheelShape = new CANNON.Sphere(1);
    const wheelMaterial = new CANNON.Material('carMaterial');
    const down = new CANNON.Vec3(0,-1,0); // direction vector


    // First wheel
    wheelBody1 = new CANNON.Body({
        mass, material: wheelMaterial 
    });
    wheelBody1.addShape(wheelShape);
    wheelBody1.angularDamping = 0.99;
    vehicle.addWheel({
      body: wheelBody1,
      position: new CANNON.Vec3(-2, 0, axisWidth / 2),
      axis: new CANNON.Vec3(0, 0, 1),
      direction: down,
    });

    // Second wheel
    wheelBody2 = new CANNON.Body({
        mass, material: wheelMaterial 
    });
    wheelBody2.addShape(wheelShape);
    wheelBody2.angularDamping = 0.99;
    vehicle.addWheel({
      body: wheelBody2,
      position: new CANNON.Vec3(-2, 0, -axisWidth / 2),
      axis: new CANNON.Vec3(0, 0, 1),
      direction: down,
    });

    // Third wheel
    wheelBody3 = new CANNON.Body({
        mass, material: wheelMaterial 
    });
    wheelBody3.addShape(wheelShape);
    wheelBody3.angularDamping = 0.99;
    vehicle.addWheel({
      body: wheelBody3,
      position: new CANNON.Vec3(2, 0, axisWidth / 2),
      axis: new CANNON.Vec3(0, 0, 1),
      direction: down,
    });

    // Fourth wheel
    wheelBody4 = new CANNON.Body({
        mass, material: wheelMaterial 
    });
    wheelBody4.addShape(wheelShape);
    wheelBody4.angularDamping = 0.99;
    vehicle.addWheel({
      body: wheelBody4,
      position: new CANNON.Vec3(2, 0, -axisWidth / 2),
      axis: new CANNON.Vec3(0, 0, 1),
      direction: down,
    });
}

function createRamp(){
    const rampShape = new CANNON.Box(new CANNON.Vec3(6,1,179));
    const rampBody = new CANNON.Body({
        mass: 0,
        shape: rampShape,
        material: groundMaterial,
        angularDamping: 0.5  
    });
    rampBody.position = new CANNON.Vec3(30, 1, -50);
    rampBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 10);

    world.addBody(rampBody);

    // Ramp Mesh
    const rampMat = new THREE.MeshStandardMaterial({color: 0xd3c3a2});
    const rampGeo = new THREE.BoxGeometry(12, 2, 348);

    const rampMesh = new THREE.Mesh(rampGeo, rampMat);
    scene.add(rampMesh);
    rampMesh.position.copy(rampBody.position);
    rampMesh.quaternion.copy(rampBody.quaternion);

    rampMesh.receiveShadow = true;
    rampMesh.castShadow = true;
}

function createRoof(){
    // side columns (4x4 squares)
    const sideShape = new CANNON.Box(new CANNON.Vec3(4, 60, 4));
    sideMaterial = new CANNON.Material();
    const leftBody = new CANNON.Body({
        mass: 0,
        shape: sideShape,
        material: groundMaterial,
    });
    const rightBody = new CANNON.Body({
        mass: 0,
        shape: sideShape,
        material: groundMaterial
    });
    leftBody.position = new CANNON.Vec3(-37, 0, 120);
    rightBody.position = new CANNON.Vec3(30, 0, 120);

    world.addBody(leftBody);
    world.addBody(rightBody);

    //roof mesh
    const roofMat = new THREE.MeshPhysicalMaterial({
        color: 0xd3c3a2,
        roughness: 0.7,
        transmission: 1,
        thickness: 1
    });
    const sideGeo = new THREE.BoxGeometry(8, 120, 8);

    const leftMesh = new THREE.Mesh(sideGeo, roofMat);
    scene.add(leftMesh);

    const rightMesh = new THREE.Mesh(sideGeo, roofMat);
    scene.add(rightMesh);

    leftMesh.position.copy(leftBody.position);
    rightMesh.position.copy(rightBody.position);

    leftMesh.castShadow = true;
    rightMesh.castShadow = true;

    // upper part
    let previous;
    const mass = 2;
    const size = 4;
    const space = size * 0.1;
    const shape = new CANNON.Box(new CANNON.Vec3(size, size, size));
    const N = 10;
    const geo = new THREE.BoxGeometry(2*size, 2*size, 2*size);

    for(let i = 0; i < N; i++){
        const boxBody = new CANNON.Body({
            shape,
            mass,
            position: new CANNON.Vec3(-(N-i-N/2) * (size*2 + space*2), 70, 120)
        });
        world.addBody(boxBody);
        bodiesArray.push(boxBody);
        
        const upMat = new THREE.MeshPhysicalMaterial({
            metalness: 0,
            roughness: 0,
            transmission: 1
        });
        upMat.color.set("#" + ((1 << 24) * Math.random() | 0).toString(16).padStart(6, "0"));
        const mesh = new THREE.Mesh(geo, upMat);
        scene.add(mesh);
        meshesArray.push(mesh);

        mesh.castShadow = true;

        if(previous){
            const lockConstraint = new CANNON.LockConstraint(boxBody, previous);
            world.addConstraint(lockConstraint);
        }
        previous = boxBody;
    }

}


function createWalls(){
    const wallShape = new CANNON.Box(new CANNON.Vec3(500, 120, 15));

    const wallBody1 = new CANNON.Body({
        mass: 0,
        shape: wallShape,
        material: groundMaterial,
        position: new CANNON.Vec3(0, 0, -300)
    });
    world.addBody(wallBody1);

    const wallGeo = new THREE.BoxGeometry(1000, 240, 30);
    const wallMat = new THREE.MeshPhysicalMaterial({
        transmission: 1,
        
    });

    const wallMesh1 = new THREE.Mesh(wallGeo, wallMat);
    scene.add(wallMesh1);
    wallMesh1.position.copy(wallBody1.position);

    wallMesh1.receiveShadow = true;

}

function createButtons(){
    const buttonShape = new CANNON.Cylinder(1, 1, 0.2);
    buttonBody1 = new CANNON.Body({
        mass: 0,
        shape: buttonShape,
        material: groundMaterial,
        position: new CANNON.Vec3(30, 55, 116)
    });
    buttonBody1.quaternion.setFromEuler(-Math.PI/2, 0, 0);

    buttonBody2 = new CANNON.Body({
        mass: 0,
        shape: buttonShape,
        material: groundMaterial,
        position: new CANNON.Vec3(-37, 4, 116)
    });
    buttonBody2.quaternion.copy(buttonBody1.quaternion);

    world.addBody(buttonBody1);
    world.addBody(buttonBody2);

    const buttonMat = new THREE.MeshPhongMaterial({color: 0xff0000});
    const buttonGeo = new THREE.CylinderGeometry(2, 2, 0.4);

    const buttonMesh1 = new THREE.Mesh(buttonGeo, buttonMat);
    scene.add(buttonMesh1);

    const buttonMesh2 = new THREE.Mesh(buttonGeo, buttonMat);
    scene.add(buttonMesh2);

    buttonMesh1.position.copy(buttonBody1.position);
    buttonMesh1.quaternion.copy(buttonBody1.quaternion);

    buttonMesh2.position.copy(buttonBody2.position);
    buttonMesh2.quaternion.copy(buttonBody2.quaternion);

}

buttonBody2.addEventListener('collide', (event) => {
    console.log(event.body.id);
    if(event.body.id === 1 && !rampExists){
        console.log("COLLISSION");
        rampExists = true;
        createRamp();
    }
})


// Commands to move car
// MOVE
document.addEventListener('keydown', (event) => {
    switch(event.key){
        case 'a':
            vehicle.setSteeringValue(maxSteerVal, 0);
            vehicle.setSteeringValue(maxSteerVal, 1);
            break;

        case 'd':
            vehicle.setSteeringValue(-maxSteerVal, 0);
            vehicle.setSteeringValue(-maxSteerVal, 1);
            break;

        case 'w':
            vehicle.setWheelForce(maxForce, 0);
            vehicle.setWheelForce(maxForce, 1);
            break;

        case 's':
            vehicle.setWheelForce(-maxForce / 2, 0);
            vehicle.setWheelForce(-maxForce / 2, 1);
            vehicle.setWheelForce(-maxForce / 2, 2);
            vehicle.setWheelForce(-maxForce / 2, 3);
            break;
    }
});

// STOP
document.addEventListener('keyup', (event) => {
    switch (event.key) {
      case 'w':
        vehicle.setWheelForce(0, 0);
        vehicle.setWheelForce(0, 1);
        break;

      case 's':
        vehicle.setWheelForce(0, 0);
        vehicle.setWheelForce(0, 1);
        vehicle.setWheelForce(0,2);
        vehicle.setWheelForce(0,3);
        break;

      case 'a':
        vehicle.setSteeringValue(0, 0);
        vehicle.setSteeringValue(0, 1);
        break;

      case 'd':
        vehicle.setSteeringValue(0, 0);
        vehicle.setSteeringValue(0, 1);
        break;
    }
});

// Create the meshes for the vehicle
function createMeshes(){
    const wheelGeo = new THREE.SphereGeometry(1);
    const wheelMat = new THREE.MeshNormalMaterial({transparent: true, opacity: 0});

    wheelMesh1 = new THREE.Mesh(wheelGeo, wheelMat);
    scene.add(wheelMesh1);

    wheelMesh2 = new THREE.Mesh(wheelGeo, wheelMat);
    scene.add(wheelMesh2);

    wheelMesh3 = new THREE.Mesh(wheelGeo, wheelMat);
    scene.add(wheelMesh3);

    wheelMesh4 = new THREE.Mesh(wheelGeo, wheelMat);
    scene.add(wheelMesh4);
}

// Update sync between mesh and body
function updateCar(){
    if(carMesh){
        carMesh.position.copy(carBody.position);
        carMesh.quaternion.copy(carBody.quaternion);
        camera.lookAt(carMesh.position);
    }

    wheelMesh1.position.copy(wheelBody1.position);
    wheelMesh1.quaternion.copy(wheelBody1.quaternion);

    wheelMesh2.position.copy(wheelBody2.position);
    wheelMesh2.quaternion.copy(wheelBody2.quaternion);

    wheelMesh3.position.copy(wheelBody3.position);
    wheelMesh3.quaternion.copy(wheelBody3.quaternion);

    wheelMesh4.position.copy(wheelBody4.position);
    wheelMesh4.quaternion.copy(wheelBody4.quaternion);

}

function updateItems(){
    for (let i = 0; i < meshesArray.length; i++) {
        meshesArray[i].position.copy(bodiesArray[i].position);
        meshesArray[i].quaternion.copy(bodiesArray[i].quaternion);
    }
}


function animate(){
    //cannonDebugger.update();
    
    world.step(timeStep);

    updateCar();
    updateChaseCam();

    if(bodiesArray){
        updateItems();
    }

    renderer.render(scene, camera);
    
    requestAnimationFrame(animate);
}


// UPDATE FUNCTIONS

function updateChaseCam(){
    chaseCamPilot.getWorldPosition(view);
    if (view.y < 1) view.y = 1; // y always positive to avoid camera flip

    camera.position.lerpVectors(camera.position, view, 0.3); // gap between camera and car
}

// Adapt to window resize
function onWindowResize(){
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);