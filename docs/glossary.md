# Glossary

## Chunk

A bounded section of a document stored with metadata and an embedding.

## Citation

A saved link from an answer to the retrieved chunk and source document that supported it.

## Document

Normalized content that can be chunked and searched. It may come from an external connector or a document published inside VaultMind.

## Embedding

A numeric representation used for similarity search. VaultMind stores embeddings in PostgreSQL through pgvector.

## Retrieval scope

The vault, workspace, spaces, sources, and document state allowed for a question. Scope is applied before vector ranking.

## Source adapter

Provider-specific code that loads external content and returns `SourceDocument[]`.

## Space

A named group of documents used for navigation and optional retrieval filtering.

## Vault

The top-level knowledge container shown in the application.

## Workspace index

The persistence and retrieval unit behind connected sources and indexed documents. The UI presents this through spaces and source management.
