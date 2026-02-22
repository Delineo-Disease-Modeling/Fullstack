'use client';

import { useEffect, useRef } from 'react';

export default function DiseaseGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let animationFrameId: number;

    const NODE_COUNT = 60;
    const CONNECTION_DISTANCE = 150;
    const INFECTION_CHANCE = 0.02;
    const REMOVAL_CHANCE = 0.001;
    const TRANSMISSION_SPEED = 2;

    const styles = getComputedStyle(document.documentElement);
    const COLOR_HEALTHY =
      styles.getPropertyValue('--color-primary-blue').trim() || '#78a0ff';
    const COLOR_INFECTED =
      styles.getPropertyValue('--color-accent-red').trim() || '#f05464';
    const COLOR_REMOVED =
      styles.getPropertyValue('--color-gray-dark').trim() || '#505050';

    let nodes: any[] = [];
    let transmissions: any[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    class Node {
      x: number;
      y: number;
      vx: number;
      vy: number;
      state: string;
      opacity: number;
      constructor(x?: number, y?: number) {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.state = '';
        this.opacity = 1;
        this.reset(x, y);
      }
      reset(x?: number, y?: number) {
        this.x = x !== undefined ? x : Math.random() * canvas.width;
        this.y = y !== undefined ? y : Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.state = 'healthy';
        this.opacity = 1.0;
      }
      update(width: number, height: number) {
        if (this.state === 'removed') {
          this.opacity -= 0.005;
          if (this.opacity <= 0) this.reset();
          return;
        }
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;
        if (this.state === 'infected' && Math.random() < REMOVAL_CHANCE)
          this.state = 'removed';
      }
      draw(ctx: CanvasRenderingContext2D) {
        ctx.globalAlpha = this.opacity;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
        if (this.state === 'healthy') ctx.fillStyle = COLOR_HEALTHY;
        else if (this.state === 'infected') ctx.fillStyle = COLOR_INFECTED;
        else ctx.fillStyle = COLOR_REMOVED;
        ctx.fill();
        ctx.closePath();
        ctx.globalAlpha = 1.0;
      }
    }

    class Transmission {
      startNode: any;
      endNode: any;
      progress: number;
      isComplete: boolean;
      constructor(startNode: any, endNode: any) {
        this.startNode = startNode;
        this.endNode = endNode;
        this.progress = 0;
        this.isComplete = false;
      }
      update() {
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
        this.progress += dist === 0 ? 1 : TRANSMISSION_SPEED / dist;
        if (this.progress >= 1) {
          this.progress = 1;
          this.isComplete = true;
          if (this.endNode.state === 'healthy' && Math.random() < 0.8)
            this.endNode.state = 'infected';
        }
      }
      draw(ctx: CanvasRenderingContext2D) {
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
      for (let i = 0; i < NODE_COUNT; i++)
        nodes.push(
          new Node(Math.random() * canvas.width, Math.random() * canvas.height)
        );
      for (let i = 0; i < 3; i++)
        nodes[Math.floor(Math.random() * nodes.length)].state = 'infected';
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      nodes.forEach((node) => node.update(canvas.width, canvas.height));
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const nodeA = nodes[i];
        if (nodeA.state === 'removed') {
          nodeA.draw(ctx);
          continue;
        }
        for (let j = i + 1; j < nodes.length; j++) {
          const nodeB = nodes[j];
          if (nodeB.state === 'removed') continue;
          const dx = nodeA.x - nodeB.x,
            dy = nodeA.y - nodeB.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DISTANCE) {
            ctx.beginPath();
            ctx.moveTo(nodeA.x, nodeA.y);
            ctx.lineTo(nodeB.x, nodeB.y);
            ctx.strokeStyle = `rgba(120, 160, 255, ${0.3 * (1 - dist / CONNECTION_DISTANCE)})`;
            ctx.stroke();
            let source = null,
              target = null;
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
              if (
                !alreadyTransmitting &&
                Math.random() < INFECTION_CHANCE * 0.1
              )
                transmissions.push(new Transmission(source, target));
            }
          }
        }
        nodeA.draw(ctx);
      }
      for (let i = transmissions.length - 1; i >= 0; i--) {
        const t = transmissions[i];
        t.update();
        if (t.isComplete) transmissions.splice(i, 1);
        else t.draw(ctx);
      }
      if (!nodes.some((n) => n.state === 'infected')) {
        const healthyNodes = nodes.filter((n) => n.state === 'healthy');
        if (healthyNodes.length > 0)
          healthyNodes[Math.floor(Math.random() * healthyNodes.length)].state =
            'infected';
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
