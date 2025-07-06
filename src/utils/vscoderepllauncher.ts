

import * as vscode from 'vscode';
import { delay } from './delay';

const EXTENSION_TERMINAL_PREFIX = 'ESP32 REPL'; // Tag used in terminal names
const TERMINAL_PREF_KEY = 'userPreferredTerminal';

// Interface to store terminal and its associated command disposables
interface ReplSession {
  terminal: vscode.Terminal;
  commandDisposables: vscode.Disposable[];
}

// Map to store active REPL sessions (terminal + command disposables)
const activeReplTerminals = new Map<string, ReplSession>()

export function getStoredTerminal(
  ctx: vscode.ExtensionContext
): string | undefined {
  return ctx.globalState.get<string>(TERMINAL_PREF_KEY);
}

export async function setStoredTerminal(
  ctx: vscode.ExtensionContext,
  terminal: string | undefined
) {
  await ctx.globalState.update(TERMINAL_PREF_KEY, terminal);
}

export async function launchReplWithTerminalPicker(
  ctx: vscode.ExtensionContext,
  port: string,
  reset?: string
): Promise<void> {
  const terminalOptions = [
    'PowerShell Preview',
    'PowerShell',
    'Command Prompt',
    'Git Bash',
    'WSL Ubuntu'
  ];

  let terminalChoice: string;

  const terminalType = getStoredTerminal(ctx);
  console.log(`Stored terminal type: ${terminalType}`);

  const terminalOfChoice = await vscode.window.showQuickPick(
    [
      `Use Stored Terminal: [${terminalType || 'None'}]`,
      'Select Another Terminal'
    ],
    {
      placeHolder: `Select terminal choice?`,
      ignoreFocusOut: true,
    }
  );
  if (!terminalOfChoice) {
    vscode.window.showWarningMessage('Terminal selection cancelled.');
    console.warn('Terminal selection cancelled.');
    return;
  }

  if (terminalOfChoice === `Use Stored Terminal: [${terminalType || 'None'}]`) {
    console.log('Using stored terminal type.');
    if (terminalType && terminalOptions.includes(terminalType)) {
      console.log(`Using stored terminal type: ${terminalType}`);
      terminalChoice = terminalType;
    } else {
      const picked = await vscode.window.showQuickPick(
        terminalOptions,
        {
          placeHolder: 'Select terminal to launch mpremote REPL',
          ignoreFocusOut: true
        }
      );
      terminalChoice = picked ?? '';
    }
  } else {
    console.log('Selecting another terminal type.');
    const picked = await vscode.window.showQuickPick(
      terminalOptions,
      {
        placeHolder: 'Select another terminal to launch mpremote REPL',
        ignoreFocusOut: true
      }
    );
    terminalChoice = picked ?? '';
  }

  if (!terminalChoice) {
    vscode.window.showWarningMessage('Terminal launch cancelled.');
    console.warn('Terminal launch cancelled.');
    return;
  }

  let shellPath: string;
  let shellArgs: string[] = [];
  let initialCommand: string = `mpremote connect ${port} ${reset ?? ''} repl`;

  switch (terminalChoice) {
    case 'PowerShell Preview':
      shellPath = 'pwsh.exe';
      shellArgs = ['-NoExit', '-Command', initialCommand]; // Pass shellCommand as the third argument
      initialCommand = ''; // Clear shellCommand as it's now part of shellArgs
      break;
    case 'PowerShell':
      shellPath = 'powershell.exe';
      shellArgs = ['-NoExit', '-Command', initialCommand];
      initialCommand = '';
      break;
    case 'Command Prompt':
      shellPath = 'cmd.exe';
      shellArgs = ['/k', initialCommand];
      initialCommand = '';
      break;
    case 'Git Bash':
      shellPath = 'bash.exe';
      shellArgs = ['-c', initialCommand];
      initialCommand = '';
      break;
    case 'WSL Ubuntu':
      shellPath = 'wsl.exe';
      shellArgs = ['-e', 'bash', '-c', initialCommand];
      initialCommand = '';
      break;
    default:
      vscode.window.showErrorMessage('Unknown terminal profile.');
      console.error('Unknown terminal profile.');
      return;
  }

  const activePortsKey = Array.from(activeReplTerminals.keys());
  const activePortsVal = Array.from(activeReplTerminals.values());
  console.log(`Active Ports Keys: ${activePortsKey}`);
  console.log(`Active Ports Values: ${activePortsVal}`);

  // Check if a REPL terminal for this port is already active
  if (activeReplTerminals.has(port)) {
    const existingSession = activeReplTerminals.get(port)!;
    const existingTerminal = existingSession.terminal;

    const isDisposed = existingTerminal.exitStatus !== undefined;
    console.log(`Terminal is disposed: ${isDisposed}`);

    console.log(`existingSession name: ${existingSession.terminal.name}`);
    console.log(`existingSession commandDisposables: ${existingSession.commandDisposables}`);

    const active = vscode.window.activeTerminal;

    // Check if the terminal is not focused or not visible
    const isNotFocused = !active || active.name !== existingTerminal.name;

    // Check if terminal is hidden (panel closed)
    const isPanelVisible = vscode.window.terminals.includes(existingTerminal);

    console.log(`isNotFocused: ${isNotFocused}`);
    console.log(`isPanelVisible: ${isPanelVisible}`);

    if (isNotFocused || !isPanelVisible) {
      existingTerminal.show(true); // `preserveFocus = true` ensures it comes to front
      console.log('Showing and focusing terminal...');
      vscode.window.showInformationMessage(`REPL for ${port} is already active.`);
      console.log(`REPL for ${port} is already active.`);
    } else {
      console.log('Terminal already focused.');
    }

    return;
    // }
  } else {
    console.log(`activeReplTerminals has no ${port} object.`);
  }

  // Launch in VS Code's integrated terminal
  try {
    await delay(100); // Wait briefly

    const terminalName = `${EXTENSION_TERMINAL_PREFIX} (${port})`;
    const newTerminal = vscode.window.createTerminal({
      name: terminalName,
      shellPath: shellPath,
      shellArgs: shellArgs,
      hideFromUser: false // Make it visible to the user
    });
    console.log(`newTerminal: ${newTerminal}`);

    const commandDisposables: vscode.Disposable[] = [];

    // Store the active session (terminal and its command disposables)
    await ctx.globalState.update('portKey', port);
    activeReplTerminals.set(port, { terminal: newTerminal, commandDisposables: commandDisposables });

    // Register a listener for when this specific terminal is closed
    ctx.subscriptions.push(vscode.window.onDidCloseTerminal(closedTerminal => {
      if (closedTerminal === newTerminal) {
        console.log(`REPL terminal for ${port} closed.`);
        const session = activeReplTerminals.get(port);
        if (session) {
          // Dispose of all commands associated with this closed terminal
          session.commandDisposables.forEach(d => d.dispose());
          session.commandDisposables.length = 0; // Clear the array
        }
        activeReplTerminals.delete(port);
        vscode.window.showInformationMessage(`REPL for ${port} has been terminated.`);
        console.log(`REPL for ${port} has been terminated.`);
      }
    }));

    newTerminal.show(true); // Show the terminal and bring it to focus

    if (initialCommand) {
      newTerminal.sendText(initialCommand);
    }

    await setStoredTerminal(ctx, terminalChoice);

    vscode.window.showInformationMessage(`mpremote REPL launched on ${port} in VS Code's ${terminalChoice} terminal.`);
    console.log(`mpremote REPL launched on ${port} in VS Code's ${terminalChoice} terminal.`);

  } catch (error: any) {
    await setStoredTerminal(ctx, undefined);
    vscode.window.showErrorMessage(`Failed to launch REPL: ${error.message}`);
    console.error(`Failed to launch REPL: ${error.message}`);
  }
}

// Helper to dispose all active REPL terminals when the extension deactivates
export function deactivateReplTerminals() {
  console.log('[deactivateReplTerminals]');
  activeReplTerminals.forEach(session => {
    session.terminal.dispose(); // This will trigger onDidCloseTerminal for each one
    session.commandDisposables.forEach(d => d.dispose());
  });
  activeReplTerminals.clear();
}

// Define your predefined commands here or import from a separate file
export const predefinedReplCommands = [
  {
    label: 'Soft Reset',
    command: '\x03',
    description: 'Interrupts current script (Ctrl+C)'
  },
  {
    label: 'Hard Reset',
    command: '\x04',
    description: 'Reboots MicroPython (Ctrl+D)'
  },
  {
    label: 'Uchefuna Function',
    command: `import uchefuna as ufa\r\nprint(ufa.uche(''))\r\n`,
    description: 'Run uchefuna function in frozen module'
  },
  {
    label: 'List Files',
    command: 'import os\r\nos.listdir()\r\n',
    description: 'Lists files on the device'
  },
  {
    label: 'Free Memory',
    command: 'import gc\r\nprint(f"Free memory: {gc.mem_free()} bytes")\r\n',
    description: 'Shows available memory'
  },
  {
    label: 'Python Version',
    command: 'import sys\r\nsys.version\r\n',
    description: 'Shows MicroPython version'
  },
  {
    label: 'Close REPL',
    command: '@@CLOSE_REPL@@',
    description: 'Close the active REPL terminal (special command)'
  }
];


// --- Register Global Commands for Active REPL Control ---
export function activeReplActions(
  ctx: vscode.ExtensionContext
) {
  // Helper to get labels for placeholder
  const predefinedReplCommandLabels = predefinedReplCommands.map(cmd => cmd.label).join(', ');
  console.log(`predefinedReplCommandLabels: ${predefinedReplCommandLabels}`);

  let commandLabel: string | undefined;

  ctx.subscriptions.push(
    // Register a command to send soft reset
    vscode.commands.registerCommand(
      `micropython-vs-extension.softResetRepl`,
      async () => {
        commandLabel = 'Soft Reset';
        await getTextToSend(commandLabel)
      }
    ),

    // Register a command to send list files
    vscode.commands.registerCommand(
      `micropython-vs-extension.listFilesRepl`,
      async () => {
        commandLabel = 'list files';
        await getTextToSend(commandLabel)
      }
    ),

    // Register a command to send hard reset (Ctrl+D usually)
    vscode.commands.registerCommand(
      `micropython-vs-extension.hardResetRepl`,
      async () => {
        const action = await vscode.window.showQuickPick(
          ['NO', 'YES'],
          {
            placeHolder: `Are Sure You Want to hard reset the device ?`,
            ignoreFocusOut: true,
          }
        );
        if (!action || action === 'NO') return;

        commandLabel = 'Hard Reset';
        await getTextToSend(commandLabel)
      }
    ),

    // Register a command to close the REPL terminal
    vscode.commands.registerCommand(
      `micropython-vs-extension.closeActiveRepl`,
      async () => {
        const action = await vscode.window.showQuickPick(
          ['NO', 'YES'],
          {
            placeHolder: `Are Sure You Want to close the device REPL ?`,
            ignoreFocusOut: true,
          }
        );
        if (!action || action === 'NO') return;

        commandLabel = 'Close REPL';
        await getTextToSend(commandLabel)
      }
    ),

    // Register a command to close the REPL terminal
    vscode.commands.registerCommand(
      `micropython-vs-extension.exitAndRefocusRepl`,
      async () => {
        const action = await vscode.window.showQuickPick(
          ['NO', 'YES'],
          {
            placeHolder: `Are Sure You Want to close the device REPL ?`,
            ignoreFocusOut: true,
          }
        );
        if (!action || action === 'NO') return;

        commandLabel = 'Exit and refocus REPL';
        await getTextToSend(commandLabel)
      }
    ),

    // NEW: Command to send a predefined or custom text input to the REPL
    vscode.commands.registerCommand(
      'micropython-vs-extension.sendCustomReplCommand', async () => {
        commandLabel = await vscode.window.showInputBox({
          prompt: 'Enter command (e.g., Soft Reset, List Files, Uchefuna Function)',
          placeHolder: `Valid commands: ${predefinedReplCommandLabels}`,
          ignoreFocusOut: true, // Keep input box open even if focus is lost
          validateInput: (textInput: string) => {
            const found = predefinedReplCommands.find(cmd => cmd.label.toLowerCase() === textInput.toLowerCase());
            if (!found) {
              return `"${textInput}" is not a recognized command. Please choose from: ${predefinedReplCommandLabels}`;
            }
            return undefined; // Input is valid
          }
        });

        await getTextToSend(commandLabel)
      }
    ),

    // NEW: Command to send a custom text input to the REPL
    vscode.commands.registerCommand(
      'micropython-vs-extension.sendCustomReplWriteCommand', async () => {
        commandLabel = await vscode.window.showInputBox({
          prompt: 'Enter MicroPython REPL command',
          placeHolder: 'e.g: import os\\r\\nos.listdir()\\r\\n',
          value: 'import os\\r\\nos.listdir()\\r\\n' // Provide a common default
        });

        await getTextToSend(commandLabel)
      }
    ),
  )
}

export async function getTextToSend(
  commandLabel: string | undefined
) {
  if (commandLabel === undefined) { // User cancelled input
    vscode.window.showWarningMessage('Command input cancelled.');
    console.warn('Command input cancelled.');
    return;
  }

  console.log(`command label: ${commandLabel}`);

  let isCommandNewLine = commandLabel.includes('\\r\\n');
  console.log(`isCommandNewLine 1: ${isCommandNewLine}`);

  // Convert escaped `\r\n` into real carriage return + newline
  const commandToSend = commandLabel.replace(/\\r\\n/g, '\r\n');
  console.log(`commandToSend: ${commandToSend}`);

  isCommandNewLine = commandToSend.includes('\r\n');
  console.log(`isCommandNewLine 2: ${isCommandNewLine}`);

  if (isCommandNewLine) {
    await selectAndControlRepl('sendText', commandToSend);
    return;
  }

  if (commandLabel === 'Exit and refocus REPL') {
    await selectAndControlRepl('exitRefocus');
    return;
  }

  const selectedCommand = predefinedReplCommands.find(cmd => cmd.label.toLowerCase() === commandLabel!.toLowerCase());

  if (!selectedCommand) {
    // This case should ideally not be reached due to validateInput, but for safety
    vscode.window.showErrorMessage('Internal error: Selected command not found after validation.');
    console.warn('Internal error: Selected command not found after validation.');
    return;
  }

  console.log(`selectedCommand: ${selectedCommand}`);

  if (selectedCommand.label === 'Uchefuna Function') {
    const optArgu = await vscode.window.showInputBox({
      prompt: 'Enter input argument for  Uchefuna Function',
      placeHolder: `like hello`,
      ignoreFocusOut: true, // Keep input box open even if focus is lost
    });
    console.log(`optArgu: ${optArgu}`);
    selectedCommand.command = `import uchefuna as ufa\r\nprint(ufa.uche('${optArgu}'))\r\n`;
  }

  // Now call the selectAndControlRepl with the actual command text or actionText type
  if (selectedCommand.command === '@@CLOSE_REPL@@') {
    await selectAndControlRepl('dispose');
  } else {
    await selectAndControlRepl('sendText', selectedCommand.command);
  }
}

// Helper function to select and control a REPL
async function selectAndControlRepl(
  // action: 'sendText' | 'dispose',
  actionText: string,
  textToSend?: string
) {
  const activePorts = Array.from(activeReplTerminals.keys());
  console.log(`activePorts: ${activePorts}`);

  if (activePorts.length === 0) {
    vscode.window.showInformationMessage('No active MicroPython REPL sessions found.');
    console.log('No active MicroPython REPL sessions found.');
    return;
  }

  let portNum: string | undefined;

  if (activePorts.length === 1) {
    portNum = activePorts[0]; // Auto-select if only one active
  } else {
    portNum = await vscode.window.showQuickPick(
      activePorts,
      {
        placeHolder: `Select REPL port to ${actionText}`,
        ignoreFocusOut: true
      }
    );
  }

  if (!portNum) {
    vscode.window.showWarningMessage('REPL portNum selection cancelled.');
    console.warn('REPL portNum selection cancelled.');
    return;
  }

  const session = activeReplTerminals.get(portNum);
  const terinalState = session?.terminal.state.isInteractedWith;
  console.log(`session: ${session?.terminal}`);
  console.log(`command to send: ${textToSend as string}`);
  console.log(`terinalState: ${terinalState}`);

  if (session) {
    // switch (action) {
    switch (actionText) {
      case 'sendText':
        if (textToSend !== undefined) {
          session.terminal.sendText(textToSend);
          // Add a newline to ensure command executes if it doesn't already have one
          if (!textToSend.endsWith('\n') && !textToSend.endsWith('\r')) {
            session.terminal.sendText('\r\n');
          }
          vscode.window.showInformationMessage(`Command sent to REPL on ${portNum}.`);
          console.log(`Command sent to REPL on ${portNum}.`);
        } else {
          vscode.window.showErrorMessage('No text provided for sendText actionText.');
          console.error('No text provided for sendText actionText.');
        }
        break;
      case 'dispose':
        session.terminal.dispose(); // This will trigger the onDidCloseTerminal handler
        vscode.window.showInformationMessage(`REPL on ${portNum} has been closed.`);
        console.log(`REPL on ${portNum} has been closed.`);
        break;
      case 'exitRefocus':
        session.terminal.sendText('SystemExit()'); // or any quit command
        session.terminal.sendText(''); // Send a newline or clear the prompt
        session.terminal.show(true); // Bring it to focus
        vscode.window.showInformationMessage(`REPL exited and refocus on ${portNum}.`);
        console.log(`REPL exited and refocus on ${portNum}.`);
        break;
    }
  } else {
    vscode.window.showWarningMessage(`REPL for port ${portNum} is no longer active.`);
    console.warn(`REPL for port ${portNum} is no longer active.`);
    // Clean up if for some reason it's still in the map but terminal is gone
    activeReplTerminals.delete(portNum);
  }
}

export async function killExistingTerminals() {
  // Kill all existing terminals at activation
  const vsTerminals = vscode.window.terminals;
  if (vsTerminals.length > 0) {
    vsTerminals.forEach((term) => {
      const terinalState = term.state.isInteractedWith;
      console.log(`terinalState: ${terinalState}`);
      console.log(`Existing terminal: ${term.name}`);
      const esp32Terminal = term.name.startsWith(EXTENSION_TERMINAL_PREFIX);
      if (esp32Terminal) {
        console.log(`Killing extension terminal on startup: ${term.name}`);
        term.dispose(); // Immediately closes the terminal
        console.log(`${term.name} successfully disposed!`);
      }
    });
  } else {
    console.log('No terminals were open at startup.');
  }
}

export async function checkAndRefocusExistingTerminal(
  ctx: vscode.ExtensionContext,
) {
  // Check if a REPL terminal for this port is already active
  const getPort = ctx.globalState.get<string>('portKey') ?? '';
  console.log(`getPort: ${getPort}`);

  if (!getPort) {
    console.log('No port key found. Exiting ...');
    return;
  }

  if (activeReplTerminals.has(getPort)) {
    const existingSession = activeReplTerminals.get(getPort)!;
    const existingTerminal = existingSession.terminal;

    const isDisposed = existingTerminal.exitStatus !== undefined;
    console.log(`Terminal is disposed: ${isDisposed}`);

    console.log(`existingSession name: ${existingSession.terminal.name}`);
    console.log(`existingSession commandDisposables: ${existingSession.commandDisposables}`);

    // const esp32Terminal = existingSession.terminal.name.startsWith(EXTENSION_TERMINAL_PREFIX);
    // const activeTerminalName = vscode.window.activeTerminal?.name.startsWith(EXTENSION_TERMINAL_PREFIX);
    const active = vscode.window.activeTerminal;

    // Check if the terminal is not focused or not visible
    const isNotFocused = !active || active.name !== existingTerminal.name;

    // Check if terminal is hidden (panel closed)
    const isPanelVisible = vscode.window.terminals.includes(existingTerminal);

    console.log(`isNotFocused: ${isNotFocused}`);
    console.log(`isPanelVisible: ${isPanelVisible}`);

    // if (activeTerminalName !== esp32Terminal) {
    if (isNotFocused || !isPanelVisible) {
      existingSession.terminal.show(true); // Bring it to focus

      console.log('Showing and focusing terminal...');
      vscode.window.showInformationMessage(`REPL for ${getPort} is already active.`);
      console.log(`REPL for ${getPort} is already active.`);
      return;
    } else {
      console.log('No active terminals were open.');
    }

    return;
  } else {
    console.log(`activeReplTerminals has no ${getPort} object.`);
  }
}

export function listeningForTerminal(
  ctx: vscode.ExtensionContext
) {
  // 2. Listen for new terminals being opened
  const terminalOpenListener = vscode.window.onDidOpenTerminal(
    (term) => {
      console.log(`Terminal opened: ${term.name}`);
      console.log(`Terminal state: ${term.state.isInteractedWith}`);
      console.log(`Terminal shellIntegration: ${term.shellIntegration?.executeCommand}`);
      console.log(`Terminal exitStatus: ${term.exitStatus?.reason}`);

      if (term?.shellIntegration) {
        console.log("🔧 Shell integration is enabled for this terminal.");
      }
    }
  );

  const terminalChangeState = vscode.window.onDidChangeTerminalState(
    e => {
      console.log("Terminal state changed", e.name, e.state);
    }
  );

  ctx.subscriptions.push(terminalOpenListener, terminalChangeState);
}
