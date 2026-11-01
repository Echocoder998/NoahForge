import { useEffect, useRef, useState } from "react";

type Props = {
  positions: Float32Array;
  indices: Uint32Array;
  color: string;
};

type Api = {
  setMesh: (positions: Float32Array, indices: Uint32Array, color: string) => void;
};

export function Viewport({ positions, indices, color }: Props) {
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const latest = useRef({ positions, indices, color });
  latest.current = { positions, indices, color };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dead = false;
    let cleanup = () => {};

    void (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      if (dead || !hostRef.current) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.className = "block h-full w-full";
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 8000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;

      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a737b, 0.9));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(90, 160, 70);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xc5afb6, 0.85);
      rim.position.set(-110, 50, -40);
      scene.add(rim);

      const bedMat = new THREE.MeshStandardMaterial({ color: 0xe8e2e4, roughness: 1 });
      const bed = new THREE.Mesh(new THREE.CircleGeometry(1, 72), bedMat);
      bed.rotation.x = -Math.PI / 2;
      bed.position.y = -0.15;
      scene.add(bed);
      const grid = new THREE.GridHelper(10, 10, 0x61162d, 0xd7c8cd);
      grid.position.y = 0;
      scene.add(grid);

      const mat = new THREE.MeshStandardMaterial({
        color: latest.current.color,
        roughness: 0.58,
        metalness: 0.02,
      });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      mesh.rotation.x = -Math.PI / 2;
      scene.add(mesh);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x61162d });
      const edges = new THREE.LineSegments(new THREE.BufferGeometry(), edgeMat);
      edges.rotation.x = -Math.PI / 2;
      scene.add(edges);

      const fit = () => {
        mesh.updateWorldMatrix(true, false);
        const box = new THREE.Box3().setFromObject(mesh);
        if (box.isEmpty()) return;
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 12);
        const dist = maxDim * 1.85;
        camera.position.set(center.x + dist * 0.9, center.y + dist * 0.72, center.z + dist * 0.85);
        camera.near = Math.max(0.05, maxDim / 200);
        camera.far = maxDim * 30;
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.minDistance = maxDim * 0.4;
        controls.maxDistance = maxDim * 6;
        controls.update();
        const bedR = maxDim * 1.25;
        bed.scale.setScalar(bedR);
        grid.scale.set(bedR / 5, 1, bedR / 5);
      };

      const setMesh = (p: Float32Array, idx: Uint32Array, next: string) => {
        const prev = mesh.geometry;
        const prevEdges = edges.geometry;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(p.slice(), 3));
        geo.setIndex(new THREE.BufferAttribute(idx.slice(), 1));
        geo.computeVertexNormals();
        mesh.geometry = geo;
        edges.geometry = new THREE.EdgesGeometry(geo, 26);
        mat.color.set(next);
        prev.dispose();
        prevEdges.dispose();
        fit();
      };

      const resize = () => {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      let frame = 0;
      const loop = () => {
        frame = requestAnimationFrame(loop);
        controls.update();
        renderer.render(scene, camera);
      };
      loop();

      const cur = latest.current;
      if (cur.positions.length > 0) setMesh(cur.positions, cur.indices, cur.color);
      apiRef.current = { setMesh };

      cleanup = () => {
        cancelAnimationFrame(frame);
        ro.disconnect();
        controls.dispose();
        mesh.geometry.dispose();
        edges.geometry.dispose();
        mat.dispose();
        edgeMat.dispose();
        bed.geometry.dispose();
        bedMat.dispose();
        (grid.geometry as { dispose: () => void }).dispose();
        (grid.material as { dispose: () => void }).dispose();
        renderer.dispose();
        renderer.domElement.remove();
        apiRef.current = null;
      };
    })().catch(() => {
      if (!dead)
        setError("The 3D preview could not start. Your dimensions and exports remain available.");
    });

    return () => {
      dead = true;
      cleanup();
    };
  }, [attempt]);

  useEffect(() => {
    if (positions.length === 0) return;
    apiRef.current?.setMesh(positions, indices, color);
  }, [positions, indices, color]);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full touch-none" />
      {error && (
        <div
          role="alert"
          className="absolute inset-0 grid place-content-center gap-3 bg-panel p-6 text-center text-sm"
        >
          <p>{error}</p>
          <button
            className="min-h-11 rounded-md border border-line px-3"
            onClick={() => {
              setError("");
              setAttempt((n) => n + 1);
            }}
          >
            Retry 3D preview
          </button>
        </div>
      )}
    </div>
  );
}
