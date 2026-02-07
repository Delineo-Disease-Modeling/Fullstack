import { useEffect, useRef } from 'react';

export default function DiseaseGraph() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    // Configuration
    const NODE_COUNT = 60;
    const CONNECTION_DISTANCE = 150;
    const INFECTION_CHANCE = 0.02; // Chance per frame to start a transmission
    const REMOVAL_CHANCE = 0.001; // Chance for infected to die/remove
    const TRANSMISSION_SPEED = 2;

    // Colors
    // Colors
    const styles = getComputedStyle(document.documentElement);
    const COLOR_HEALTHY =
      styles.getPropertyValue('--color-primary-blue').trim() || '#78a0ff';
    const COLOR_INFECTED =
      styles.getPropertyValue('--color-accent-red').trim() || '#f05464';
    const COLOR_REMOVED =
      styles.getPropertyValue('--color-gray-dark').trim() || '#505050';

    let nodes = [];
    let transmissions = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    class Node {
      constructor(x, y) {
        this.reset(x, y);
      }

      reset(x, y) {
        this.x = x !== undefined ? x : Math.random() * canvas.width;
        this.y = y !== undefined ? y : Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.state = 'healthy'; // 'healthy', 'infected', 'removed'
        this.opacity = 1.0;
      }

      update(width, height) {
        // If removed, just fade out
        if (this.state === 'removed') {
          this.opacity -= 0.005;
          if (this.opacity <= 0) {
            // Respawn as new node
            this.reset();
          }
          return;
        }

        // Move
        this.x += this.vx;
        this.y += this.vy;

        // Bounce off walls
        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;

        // Infection logic -> Removal logic
        if (this.state === 'infected') {
          if (Math.random() < REMOVAL_CHANCE) {
            this.state = 'removed';
          }
        }
      }

      draw(ctx) {
        ctx.globalAlpha = this.opacity;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);

        if (this.state === 'healthy') ctx.fillStyle = COLOR_HEALTHY;
        else if (this.state === 'infected') ctx.fillStyle = COLOR_INFECTED;
        else if (this.state === 'removed') ctx.fillStyle = COLOR_REMOVED;

        ctx.fill();
        ctx.closePath();
        ctx.globalAlpha = 1.0;
      }
    }

    class Transmission {
      constructor(startNode, endNode) {
        this.startNode = startNode;
        this.endNode = endNode;
        this.progress = 0; // 0 to 1
        this.isComplete = false;
      }

      update() {
        // Cancel if nodes are removed/gone
        if (
          this.startNode.state === 'removed' ||
          this.endNode.state === 'removed'
        ) {
          this.isComplete = true;
          return;
        }

        const dx = this.endNode.x - this.startNode.x;
        const dy = this.endNode.y - this.startNode.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist === 0) {
          this.progress = 1;
        } else {
          this.progress += TRANSMISSION_SPEED / dist;
        }

        if (this.progress >= 1) {
          this.progress = 1;
          this.isComplete = true;
          // Try to infect
          if (this.endNode.state === 'healthy' && Math.random() < 0.8) {
            this.endNode.state = 'infected';
          }
        }
      }

      draw(ctx) {
        const currentX =
          this.startNode.x +
          (this.endNode.x - this.startNode.x) * this.progress;
        const currentY =
          this.startNode.y +
          (this.endNode.y - this.startNode.y) * this.progress;

        ctx.beginPath();
        ctx.moveTo(this.startNode.x, this.startNode.y);
        ctx.lineTo(currentX, currentY);
        ctx.strokeStyle = COLOR_INFECTED;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    const init = () => {
      resize();
      nodes = [];
      transmissions = [];
      for (let i = 0; i < NODE_COUNT; i++) {
        nodes.push(
          new Node(Math.random() * canvas.width, Math.random() * canvas.height)
        );
      }
      // Start with a few infected
      for (let i = 0; i < 3; i++) {
        nodes[Math.floor(Math.random() * nodes.length)].state = 'infected';
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Update Layout
      nodes.forEach((node) => node.update(canvas.width, canvas.height));

      // 2. Transmissions & Connections
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const nodeA = nodes[i];

        // Skip logic for removed nodes (they just drift/fade)
        if (nodeA.state === 'removed') {
          nodeA.draw(ctx);
          continue;
        }

        for (let j = i + 1; j < nodes.length; j++) {
          const nodeB = nodes[j];

          if (nodeB.state === 'removed') continue;

          const dx = nodeA.x - nodeB.x;
          const dy = nodeA.y - nodeB.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < CONNECTION_DISTANCE) {
            // Faint connection
            ctx.beginPath();
            ctx.moveTo(nodeA.x, nodeA.y);
            ctx.lineTo(nodeB.x, nodeB.y);
            ctx.strokeStyle = `rgba(120, 160, 255, ${0.3 * (1 - dist / CONNECTION_DISTANCE)})`;
            ctx.stroke();

            // Logic to start new transmission
            let source = null;
            let target = null;

            if (nodeA.state === 'infected' && nodeB.state === 'healthy') {
              source = nodeA;
              target = nodeB;
            } else if (
              nodeB.state === 'infected' &&
              nodeA.state === 'healthy'
            ) {
              source = nodeB;
              target = nodeA;
            }

            if (source && target) {
              const alreadyTransmitting = transmissions.some(
                (t) => t.startNode === source && t.endNode === target
              );

              if (!alreadyTransmitting) {
                if (Math.random() < INFECTION_CHANCE * 0.1) {
                  transmissions.push(new Transmission(source, target));
                }
              }
            }
          }
        }
        nodeA.draw(ctx);
      }

      // 3. Update & Draw Transmissions
      for (let i = transmissions.length - 1; i >= 0; i--) {
        const t = transmissions[i];
        t.update();
        if (t.isComplete) {
          transmissions.splice(i, 1);
        } else {
          t.draw(ctx);
        }
      }

      // 4. Ensure life continues (if no infected nodes exist, infect a random healthy one)
      // Check if there are any infected nodes (or nodes about to be removed but still technically spreading? No, removed ones stop spreading)
      if (!nodes.some((n) => n.state === 'infected')) {
        // Only auto-infect if we have available healthy nodes
        const healthyNodes = nodes.filter((n) => n.state === 'healthy');
        if (healthyNodes.length > 0) {
          healthyNodes[Math.floor(Math.random() * healthyNodes.length)].state =
            'infected';
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener('resize', resize);
    init();
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: -2,
        width: '100%',
        height: '100%',
        pointerEvents: 'none'
      }}
    />
  );
}
