import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import CannonDebugger from 'cannon-es-debugger'
import { GLTFLoader } from 'three/examples/jsm/Addons.js'
import * as PROGRESS from 'progressbar.js'

// Setting these variables as global
let scene, camera, renderer;
let world, cannonDebugger;
let timeStep = 1/60; // update rate for the world
let groundMaterial;

let carBody, carMesh; // car without wheels
let vehicle; // full body of the car
let wheelBody1, wheelBody2, wheelBody3, wheelBody4;
let wheelMesh1, wheelMesh2, wheelMesh3, wheelMesh4;
let maxSteerVal = Math.PI / 8; // steer of the car
let maxForce = 100; // max force on the car
let lastVelocity = 0;
let tolerance = 0.5;

let chaseCam, chaseCamPilot; // chase camera
let view = new THREE.Vector3(); // world position of the camera

let bar = new PROGRESS.SemiCircle('#speed', {
    strokeWidth: 16,
    color: '#FFEA82',
    trailColor: '#ccc',
    easing: 'easeInOut',
    duration: 1000,
    svgStyle: null,
    text: {
        value: "",
        alignToBottom: false
    },
    from: {color: '#038214'},
    to: {color: '#ff0000'},
    step: (state, bar) => {
        bar.path.setAttribute('stroke', state.color);
        let value = Math.round(bar.value() * 50);
        if(value === 0){
            bar.setText('');
        }else{
            bar.setText(value);
        }
        bar.text.style.color = state.color;
    }
});
bar.text.style.top = "5vw";
bar.text.style.fontFamily = '"Arial", Helvetica, sans-serif';
bar.text.style.fontSize = '2.0vw';

const textureLoader = new THREE.TextureLoader(); // texture loader

// Setup
initScene();
initWorld();
initChaseCam();
createGround(); // create the "earth"
createCar();
createRamp();
createRoof();
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
    const carMaterial = new CANNON.Material("carMaterial");

    const slipperyGround = new CANNON.ContactMaterial(groundMaterial, carMaterial, {
        friction: 0.9,
        restitution: 0.5,
        contactEquationStiffness: 1e9, //sponginess
        contactEquationRelaxation: 3,
        frictionEquationStiffness: 1e5,
        frictionEquationRelaxation: 3
    });

    world.addContactMaterial(slipperyGround);

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
    const wheelMaterial = new CANNON.Material('wheel');
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
    const rampShape = new CANNON.Box(new CANNON.Vec3(6,1,50));
    const rampBody = new CANNON.Body({
        mass: 0,
        shape: rampShape,
        material: groundMaterial,
        angularDamping: 0.5  
    });
    rampBody.position = new CANNON.Vec3(0, 1, 15);
    rampBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI/15);

    world.addBody(rampBody);

    // Ramp Mesh
    const rampMat = new THREE.MeshStandardMaterial({color: 0xd3c3a2});
    const rampGeo = new THREE.BoxGeometry(12, 2, 100);

    const rampMesh = new THREE.Mesh(rampGeo, rampMat);
    scene.add(rampMesh);
    rampMesh.position.copy(rampBody.position);
    rampMesh.quaternion.copy(rampBody.quaternion);

    rampMesh.receiveShadow = true;
    rampMesh.castShadow = true;
}

function createRoof(){
    const sideShape = new CANNON.Box(new CANNON.Vec3(4, 60, 4));
    const leftBody = new CANNON.Body({
        mass: 0,
        shape: sideShape,
        material: groundMaterial
    });
    const rightBody = new CANNON.Body({
        mass: 0,
        shape: sideShape,
        material: groundMaterial
    });
    leftBody.position = new CANNON.Vec3(-20, 0, 120);
    rightBody.position = new CANNON.Vec3(20, 0, 120);

    world.addBody(leftBody);
    world.addBody(rightBody);

    //roof mesh
    const roofMat = new THREE.MeshStandardMaterial({color: 0xd3c3a2});
    const sideGeo = new THREE.BoxGeometry(8, 120, 8);

    const leftMesh = new THREE.Mesh(sideGeo, roofMat);
    scene.add(leftMesh);

    const rightMesh = new THREE.Mesh(sideGeo, roofMat);
    scene.add(rightMesh);

    leftMesh.position.copy(leftBody.position);
    rightMesh.position.copy(rightBody.position);

    leftMesh.castShadow = true;
    rightMesh.castShadow = true;

}

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


function animate(){
    //cannonDebugger.update();
    
    world.step(timeStep);

    updateCar();
    updateChaseCam();
    updateVelocity();

    renderer.render(scene, camera);
    
    requestAnimationFrame(animate);
}

function updateChaseCam(){
    chaseCamPilot.getWorldPosition(view);
    if (view.y < 1) view.y = 1; // y always positive to avoid camera flip

    camera.position.lerpVectors(camera.position, view, 0.3); // gap between camera and car
}



function updateHUD(){
    bar.animate(lastVelocity / 35); // 35 is real max velocity
}

function getVelocity(vel){
    return Math.sqrt(vel.x*vel.x + vel.y*vel.y + vel.z*vel.z);
}

function updateVelocity(){
    const speed = getVelocity(carBody.velocity);
    if (Math.abs(speed-lastVelocity) > tolerance){
        lastVelocity = speed;
        updateHUD();
    }
}

// Adapt to window resize
function onWindowResize(){
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);