/**
 * Sistema de Conferência de Kits — Etapa 1
 *
 * Configure o ID da planilha nas Propriedades do script usando a chave
 * SPREADSHEET_ID. O ID não é enviado para o navegador.
 */

const CONFIG = {
  spreadsheetIdProperty: 'SPREADSHEET_ID',
  requiredSheets: {
    'PEÇAS': ['ID', 'Nome', 'Cod_Fabrica', 'Cod_Barras'],
    KITS: ['ID', 'Nome'],
    'KIT_PEÇAS': ['ID', 'Kit_ID', 'Peca_ID', 'Quantidade'],
    'CONFERÊNCIAS': ['ID', 'Kit_ID', 'Data_Hora', 'Resultado'],
    'CONFERENCIA_PEÇAS': ['ID', 'Conferencia_ID', 'Peca_ID', 'Esperada', 'Encontrada']
  }
};

/** Exibe o frontend quando o Web App é aberto. */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Sistema de Conferência de Kits')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Permite inserir arquivos HTML parciais no Index.html. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Teste ponta a ponta: navegador -> Apps Script -> Google Sheets.
 * Também confirma a existência e os cabeçalhos das cinco abas exigidas.
 */
function testConnection() {
  const spreadsheet = getSpreadsheet_();
  validateSpreadsheetStructure_(spreadsheet);

  return {
    ok: true,
    message: 'Comunicação com o Google Sheets estabelecida.',
    spreadsheetName: spreadsheet.getName(),
    testedAt: new Date().toISOString(),
    sheets: spreadsheet.getSheets().map(function(sheet) { return sheet.getName(); })
  };
}

/** Busca peças; a consulta é opcional e pesquisa nome, código interno e barras. */
function getPieces(query) {
  const pieces = readSheetObjects_('PEÇAS').map(function(row) {
    return {
      id: row.ID,
      nome: row.Nome,
      codFabrica: row.Cod_Fabrica,
      // Valores de exibição preservam zeros à esquerda e evitam conversão numérica.
      codBarras: row.Cod_Barras
    };
  });

  const term = String(query || '').trim().toLowerCase();
  if (!term) return pieces;

  return pieces.filter(function(piece) {
    return [piece.nome, piece.codFabrica, piece.codBarras].some(function(value) {
      return String(value).toLowerCase().indexOf(term) !== -1;
    });
  });
}

/** Busca todos os kits cadastrados. */
function getKits() {
  return readSheetObjects_('KITS').map(function(row) {
    return { id: row.ID, nome: row.Nome };
  });
}

/** Busca as peças físicas que compõem um kit específico. */
function getKitComposition(kitId) {
  const normalizedKitId = String(kitId || '').trim();
  if (!normalizedKitId) throw new Error('Informe o ID do kit.');

  const kits = getKits();
  const kit = kits.find(function(item) { return String(item.id) === normalizedKitId; });
  if (!kit) throw new Error('Kit não encontrado: ' + normalizedKitId);

  const piecesById = {};
  getPieces().forEach(function(piece) { piecesById[String(piece.id)] = piece; });

  const composition = readSheetObjects_('KIT_PEÇAS')
    .filter(function(row) { return String(row.Kit_ID) === normalizedKitId; })
    .map(function(row) {
      const piece = piecesById[String(row.Peca_ID)];
      return {
        id: row.ID,
        pecaId: row.Peca_ID,
        quantidade: row.Quantidade,
        peca: piece || null
      };
    });

  return { kit: kit, pecas: composition };
}

/**
 * Registra a conferência concluída e cada item conferido.
 * As quantidades esperadas são calculadas novamente no servidor a partir da
 * composição cadastrada, em vez de confiar nos valores exibidos no navegador.
 */
function saveConference(kitId, readings, invalidBarcodes) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = getSpreadsheet_();
    validateSpreadsheetStructure_(spreadsheet);
    const composition = getKitComposition(kitId);
    const foundByPieceId = {};

    (Array.isArray(readings) ? readings : []).forEach(function(reading) {
      const pieceId = String(reading.pecaId || '').trim();
      const found = Number(reading.encontrada);
      if (pieceId && Number.isFinite(found) && found >= 0) {
        // Há somente uma linha por peça no navegador; max evita duplicidade acidental.
        foundByPieceId[pieceId] = Math.max(foundByPieceId[pieceId] || 0, Math.floor(found));
      }
    });

    const invalidCount = Array.isArray(invalidBarcodes) ? invalidBarcodes.length : 0;
    let expectedTotal = 0;
    let foundTotal = 0;
    let missingTotal = 0;
    let excessTotal = 0;
    const itemRows = composition.pecas.map(function(item) {
      const expected = Number(item.quantidade) || 0;
      const found = foundByPieceId[String(item.pecaId)] || 0;
      expectedTotal += expected;
      foundTotal += found;
      missingTotal += Math.max(expected - found, 0);
      excessTotal += Math.max(found - expected, 0);
      return [item.pecaId, expected, found];
    });

    const isExact = missingTotal === 0 && excessTotal === 0 && invalidCount === 0;
    const result = isExact ? 'CONFERIDO' : 'DIVERGÊNCIA';
    const conferencesSheet = spreadsheet.getSheetByName('CONFERÊNCIAS');
    const conferencePiecesSheet = spreadsheet.getSheetByName('CONFERENCIA_PEÇAS');
    const conferenceId = getNextId_(conferencesSheet);
    const now = new Date();

    conferencesSheet.appendRow([conferenceId, composition.kit.id, now, result]);
    if (itemRows.length) {
      const rowsToSave = itemRows.map(function(row) {
        return [null, conferenceId, row[0], row[1], row[2]];
      });
      // Reserva IDs sequenciais para todas as linhas da conferência.
      const firstPieceRecordId = getNextId_(conferencePiecesSheet);
      rowsToSave.forEach(function(row, index) { row[0] = firstPieceRecordId + index; });
      conferencePiecesSheet.getRange(conferencePiecesSheet.getLastRow() + 1, 1, rowsToSave.length, 5).setValues(rowsToSave);
    }

    return {
      conferenciaId: conferenceId,
      resultado: result,
      esperadas: expectedTotal,
      encontradas: foundTotal,
      faltando: missingTotal,
      excedentes: excessTotal,
      leiturasInvalidas: invalidCount
    };
  } finally {
    lock.releaseLock();
  }
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(CONFIG.spreadsheetIdProperty);
  if (!id) {
    throw new Error('A propriedade SPREADSHEET_ID ainda não foi configurada no projeto Apps Script.');
  }
  return SpreadsheetApp.openById(id);
}

function validateSpreadsheetStructure_(spreadsheet) {
  Object.keys(CONFIG.requiredSheets).forEach(function(sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) throw new Error('A aba obrigatória "' + sheetName + '" não foi encontrada.');

    const expectedHeaders = CONFIG.requiredSheets[sheetName];
    const actualHeaders = sheet.getRange(1, 1, 1, expectedHeaders.length).getDisplayValues()[0];
    expectedHeaders.forEach(function(header, index) {
      if (actualHeaders[index] !== header) {
        throw new Error('Cabeçalho inválido na aba "' + sheetName + '". Esperado na coluna ' + (index + 1) + ': ' + header + '.');
      }
    });
  });
}

function readSheetObjects_(sheetName) {
  const spreadsheet = getSpreadsheet_();
  validateSpreadsheetStructure_(spreadsheet);
  const sheet = spreadsheet.getSheetByName(sheetName);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0];
  return values.slice(1)
    .filter(function(row) { return row.some(function(value) { return value !== ''; }); })
    .map(function(row) {
      return headers.reduce(function(object, header, index) {
        object[header] = row[index];
        return object;
      }, {});
    });
}

function getNextId_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  let largestId = 0;
  values.forEach(function(row) {
    const value = Number(row[0]);
    if (Number.isFinite(value) && value > largestId) largestId = value;
  });
  return largestId + 1;
}
