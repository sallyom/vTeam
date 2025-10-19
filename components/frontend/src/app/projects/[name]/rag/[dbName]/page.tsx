'use client';

import React from 'react';

// RAG Database Detail Page
// TODO: Implement RAG database detail view with document management
export default function RAGDatabaseDetailPage({
  params
}: {
  params: { name: string; dbName: string }
}) {
  const { name: projectName, dbName } = params;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{dbName}</h1>
        <p className="text-gray-600">RAG Database Details</p>
      </div>

      {/* Database Info Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Database Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <p className="font-medium">Ready</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Health</p>
            <p className="font-medium">Healthy</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Documents</p>
            <p className="font-medium">0</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Chunks</p>
            <p className="font-medium">0</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Storage Used</p>
            <p className="font-medium">0 MB / 5 GB</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Last Accessed</p>
            <p className="font-medium">Never</p>
          </div>
        </div>
      </div>

      {/* Documents Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Documents</h2>
          <button
            className="btn btn-primary"
            onClick={() => {
              // TODO: Open document upload modal
            }}
          >
            Upload Documents
          </button>
        </div>

        <div className="border rounded-lg p-4">
          <p className="text-gray-500 text-center">
            No documents uploaded yet. Upload documents to start building your knowledge base.
          </p>
        </div>

        {/* TODO: Replace with DocumentTable component */}
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex gap-4">
        <button
          className="btn btn-danger"
          onClick={() => {
            // TODO: Handle database deletion
          }}
        >
          Delete Database
        </button>
      </div>
    </div>
  );
}

// TODO: Implement the following:
// 1. Use useRagDatabase hook to fetch database details
// 2. Display loading and error states
// 3. Show processing progress if status is "Processing"
// 4. Implement DocumentUpload component/modal
// 5. Implement DocumentTable component
// 6. Add delete confirmation dialog
// 7. Handle database deletion with navigation
// 8. Format dates and numbers properly
// 9. Add refresh functionality
// 10. Show appropriate status badges