# TODO

Read all items, then pick one to work on.
Ensure you start clean on main and that it is up to date.
Create a new branch off of main for each item.
Make clean commits with logically grouped changes and detailed commit messages.
Ensure all changes are tested and that all tests pass.
Run build and/or run start (with a timeout of 30 seconds or so) to ensure the project will run without exiting non zero.
For each completed item, submit a pull request.
When the pull request is submitted, switch back to main and pull.

## Setup

- [x] Set up the project as a git repository with proper .gitignore and push to GitHub.

## Defects

- [x] Chat history is not persisting when the user navigates away from the chat panel.
- [x] The llm doesn't seem to be sent the the tool results. Let's start fixing this by adding more overall transparency to the chat messages. There should ALWAYS show a 'thinking...' or 'loading...' (whatever is already in place) indicator ANYTIME the llm is being invoked within the chat. It is assumed that each invocation includes the entire chat history. All interactions are shown in the chat including tool uses by the LLM (its own dedicated bubble), tool responses (their own specific styled bubble), anything the llm says, anything the llm thinks (if thinking is on), and anything the user says. Full transparency of conversation. Also, if there are specific RAG lookups happening, those should be displayed in chat as well... not sure how that works.
- [x] PNGs are not being generated correctly.
- [x] On the settings page, the UI could use some better styling. The inputs look unstyled and many elements do not have space between them and adjacent elements. Make the 'Allow Unsafe Command Execution' checkbox centered vertically next to its label.

## Tech Debt

- [x] Find and remove code specific to Godot now that we have switched to full phaser support
- [x] The types in src\ai-service.ts are essential and used by all service implementations and the chat panel to maintain provider abstraction.
- [x] Remove code/files that are not being used. Clean up dead code.
  mcp-client.ts? (Removed)
  ai-service.ts? (Verified types are used)
- [x] Use @google/generative-ai for interfacing with Gemini models
- [x] Use a gemini text to image model to generate an icon for the rpg builder. Then update the code to use that icon. (Generated using Pollinations Flux)

## Features

- [] Create a chat view specific for generating assets. It should look similar to the existing chat and can even reuse basic components like the textarea input. It won't be used for a conversation, rather just a prompt at the top to get the user to enter a prompt for an asset. Controls above the text input to dictate the filetype and maybe even size of the asset. The users prompt will be augmented to enforce their choosen configs and sent directly to the model that performs asset generation. The generated asset
  should then be shown above the text input and config controls. The text input and controls for type, size, and filename are replaced with 'redo', 'save', 'alter' buttons. Redo sends the same exact prompt but maybe with a different seed to ensure a new result. Save stores the generated asset in the 'assets' folder. Maybe along with the type and size controls they are required to designate a filename. Alter should hide the 'redo', 'save', and 'alter' controls and reshow the text input. The generated asset remains visible. The user submits a new prompt to slightly alter the image. A model is prompt with their text input prompt to perform a text + image to image job. If no model for that is available, they are prompted to pull the relevant model from ollama and or given the option to cancel, closing the asset generation view, back to main chat. Saving the asset will also close the asset generation view and bring them back to the chat.
- [] Add new ways to generate assets. Experiment with other pipelines/models/formats. We need to find something that works.
- [] Add a view for users to manually alter assets.
- [] Inline within the code, if an asset is being referenced (look for filepaths) the extension should check if the asset exists and decorate it with a checkmark and ability to quick view the asset in a popup. If the asset does not exist, it should show a quick link to generate the asset, taking the user to the new asset generation view (see first feature TODO).
- [x] Add support for these Gemini models:
  gemini-3.1-pro-preview
  gemini-3-flash-preview
  gemini-2.5-pro
  gemini-2.5-flash
  gemini-2.5-flash-lite
- [x] Add a button in settings to manually retrigger indexing of the phaser source code. This should be functional. It should clone/pull the latest code (using gh or git, depending on user setup, fallback to helpful error message if neither is available), then begin the indexing, showing progress throughout. Disable the manual index button while indexing is taking place.
- [x] Make these models available for asset generation:
  gemini-3.1-flash-image-preview
  gemini-3-pro-image-preview
  gemini-2.5-flash-image
  imagen-4.0-generate-001
  imagen-4.0-ultra-generate-001
  imagen-4.0-fast-generate-001
