export default function InstructionBanner({ text }) {
  return (
    <div className="p-4 mb-4 text-blue-800 bg-blue-100 border border-blue-200 rounded-sm text-center">
      <i className='bi bi-info-circle pr-2' />{text}
    </div>
  );
}
