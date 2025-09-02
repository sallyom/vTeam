import React from "react";

export default function Header() {
  return (
    <header className="bg-white text-black border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div>
              <h1 className="text-xl font-semibold">RFE Refiner</h1>
              <p className="text-gray-600 text-sm">
                Multi-Agent Feature Refinement System
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center">
            <div className="text-right">
              <p className="text-sm font-medium">Powered by</p>
              <p className="text-xs text-gray-600">
                LlamaIndex + Multi-Agent AI
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
