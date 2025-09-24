import { useState } from 'react';
import * as Slider from '@radix-ui/react-slider';

export default function InterventionTimeline({ hours }) {
const [values, setValues] = useState([25, 75]);

  const handleDoubleClick = (e) => {
    const track = e.currentTarget.getBoundingClientRect();
    const clickRatio = (e.clientX - track.left) / track.width;
    const newValue = Math.round(clickRatio * 100);

    // insert the new thumb into the sorted array
    setValues((prev) => [...prev, newValue].sort((a, b) => a - b));
  };

  const handleRightClick = (e, i) => {
    e.preventDefault();

    setValues((v) => {
      const next = [...v];
      next.splice(i, 1);
      return next;
    })
  }

  return (
    <div className='flex flex-col w-full h-12 p-4'>
      {/* Timeline bar */}
      <Slider.Root
        value={values}
        onValueChange={setValues}
        min={0}
        max={hours}
        step={1}
        className="relative flex w-full items-center select-none"
        onDoubleClick={handleDoubleClick}
        onPointerDownCapture={(e) => {
          const target = e.target;
          const isThumb = target.closest('[role="slider"]');
          if (!isThumb) {
            e.preventDefault();
            e.stopPropagation(); // blocks track-click teleport
          }
        }
      }
      >
        <Slider.Track className="relative h-2 grow rounded bg-gray-300">
          <Slider.Range className="absolute h-full bg-blue-500 rounded" />
        </Slider.Track>

        {values.map((v, i) => (
          <Slider.Thumb
            key={i}
            className="block h-4 w-4 rounded-full bg-white border border-gray-400 shadow"
            onContextMenu={(e) => handleRightClick(e, i)}
          />
        ))}
      </Slider.Root>

      {/* Information */}
      <div>
        <h4>Hour #{}</h4>
      </div>
    </div>
  );
}
