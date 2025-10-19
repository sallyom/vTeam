'use client';

import React from 'react';

// RAG Database List Page
// TODO: Implement RAG database list view
export default function RAGDatabaseListPage({ params }: { params: { name: string } }) {
  const projectName = params.name;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">RAG Databases</h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            // TODO: Navigate to /projects/{projectName}/rag/new
          }}
        >
          New RAG Database
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* TODO: Map through RAG databases and display DatabaseCard components */}
        <div className="p-4 border rounded-lg">
          <p className="text-gray-500">No RAG databases yet. Create one to get started.</p>
        </div>
      </div>
    </div>
  );
}

// TODO: Implement the following:
// 1. Use useRagDatabases hook to fetch databases
// 2. Display loading state while fetching
// 3. Display error state if fetch fails
// 4. Map through databases and display DatabaseCard for each
// 5. Show empty state when no databases exist
// 6. Handle navigation to create new database
// 7. Handle click on database card to navigate to detail page