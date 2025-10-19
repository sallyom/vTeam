'use client';

import React from 'react';

// RAG Database Creation Page
// TODO: Implement RAG database creation form
export default function RAGDatabaseNewPage({ params }: { params: { name: string } }) {
  const projectName = params.name;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Create RAG Database</h1>

      <form onSubmit={(e) => {
        e.preventDefault();
        // TODO: Handle form submission
      }}>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Display Name
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 border rounded-md"
            placeholder="My RAG Database"
            required
            maxLength={100}
          />
          <p className="text-sm text-gray-500 mt-1">
            A friendly name for your RAG database (1-100 characters)
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Description (Optional)
          </label>
          <textarea
            className="w-full px-3 py-2 border rounded-md"
            rows={3}
            placeholder="Describe the purpose of this RAG database"
            maxLength={500}
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">
            Storage Size
          </label>
          <select className="w-full px-3 py-2 border rounded-md">
            <option value="1Gi">1 GB</option>
            <option value="2Gi">2 GB</option>
            <option value="3Gi">3 GB</option>
            <option value="4Gi">4 GB</option>
            <option value="5Gi" selected>5 GB (Default)</option>
          </select>
          <p className="text-sm text-gray-500 mt-1">
            Maximum storage size for your database
          </p>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            className="btn btn-primary"
          >
            Create Database
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              // TODO: Navigate back to RAG list
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// TODO: Implement the following:
// 1. Add react-hook-form for form management
// 2. Add zod for validation
// 3. Use useCreateRagDatabase mutation hook
// 4. Show loading state during creation
// 5. Handle errors and display them
// 6. Navigate to database detail page on success
// 7. Add proper TypeScript types