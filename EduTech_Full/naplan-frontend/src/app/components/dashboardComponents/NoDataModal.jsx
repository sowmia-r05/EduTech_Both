/* -------------------- No Data Modal -------------------- */
const NoDataModal = ({ isOpen, onClose, onClearFilter }) => {
  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = "hidden";

    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEsc);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="text-2xl">📅</div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              No Results Found
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              There are no quiz attempts recorded for the selected date.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-100 transition"
          >
            Close
          </button>

          <button
            onClick={onClearFilter}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            Clear Filter
          </button>
        </div>
      </div>
    </div>
  );
};

export default NoDataModal;