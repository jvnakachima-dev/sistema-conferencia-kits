# Sistema de Conferência de Kits — Etapa 1

Esta etapa cria somente a base de comunicação: interface web, Apps Script e consultas de leitura ao Google Sheets. Ainda não há conferência de kits, leitura por câmera, autenticação ou estoque.

## Arquitetura

O `Index.html` é servido pelo próprio Google Apps Script como um Web App. Ao clicar nos botões, o navegador usa `google.script.run` para executar uma função em `Code.gs`. O código do servidor lê o ID guardado nas propriedades do script e abre a planilha com `SpreadsheetApp.openById()`. Assim, a planilha não é acessada diretamente pelo navegador e o ID não fica exposto no frontend.

## Estrutura obrigatória da planilha

Crie uma planilha Google e mantenha exatamente estas abas e cabeçalhos, na primeira linha, na ordem indicada:

| Aba | Cabeçalhos |
| --- | --- |
| `PEÇAS` | `ID`, `Nome`, `Cod_Fabrica`, `Cod_Barras` |
| `KITS` | `ID`, `Nome` |
| `KIT_PEÇAS` | `ID`, `Kit_ID`, `Peca_ID`, `Quantidade` |
| `CONFERÊNCIAS` | `ID`, `Kit_ID`, `Data_Hora`, `Resultado` |
| `CONFERENCIA_PEÇAS` | `ID`, `Conferencia_ID`, `Peca_ID`, `Esperada`, `Encontrada` |

Antes de inserir dados, selecione a coluna `Cod_Barras` da aba `PEÇAS` e use **Formatar > Número > Texto simples**. Os dados são lidos com `getDisplayValues()`, preservando os códigos como texto e seus zeros à esquerda.

## Configurar o ID da planilha

1. Abra a planilha. Na URL, copie o trecho entre `/d/` e `/edit`: esse é o ID.
2. No projeto Apps Script, abra **Configurações do projeto** (ícone de engrenagem).
3. Em **Propriedades do script**, adicione `SPREADSHEET_ID` como propriedade e cole o ID como valor.
4. Salve. Não coloque o ID em `Index.html`.

## Criar e enviar o projeto Apps Script

Há duas opções:

1. **Editor web:** crie um projeto em [script.google.com](https://script.google.com), adicione os arquivos com estes mesmos nomes e cole seus conteúdos.
2. **clasp:** copie `.clasp.json.example` para `.clasp.json`, informe o `scriptId` do projeto e execute `clasp push` em um terminal já autenticado no clasp. O `.clasp.json` contém a ligação local e não deve ser enviado a repositórios públicos.

## Publicar como Web App

1. No Apps Script, clique em **Implantar > Nova implantação**.
2. Em tipo, escolha **App da Web**.
3. Execute como **Eu**.
4. Para um teste interno, escolha o acesso compatível com as pessoas que usarão o sistema. Se a empresa usa Google Workspace, prefira restringir à organização; `Qualquer pessoa` é indicado apenas se isso for realmente necessário.
5. Clique em **Implantar**, autorize o acesso à planilha quando solicitado e abra a URL fornecida.

Para publicar mudanças posteriores, crie uma nova versão da implantação e atualize-a no menu **Implantar > Gerenciar implantações**.

## Testar a comunicação

1. Verifique as abas, cabeçalhos e a propriedade `SPREADSHEET_ID`.
2. Abra a URL do Web App.
3. Clique em **Testar conexão**. O resultado deve mostrar o nome da planilha.
4. Use **Buscar peças** e **Buscar kits**; mesmo vazias, as consultas devem retornar uma lista JSON vazia.
5. Cadastre uma peça, um kit e seu vínculo em `KIT_PEÇAS`, preenchendo a quantidade esperada, para testar **Buscar composição** pelo ID do kit.

## Funções disponíveis nesta etapa

- `testConnection()` — valida conexão, abas e cabeçalhos.
- `getPieces(query)` — lista peças e pode filtrar por nome, código de fábrica ou barras.
- `getKits()` — lista kits.
- `getKitComposition(kitId)` — devolve o kit e suas peças físicas.
- `saveConference(kitId, readings, invalidBarcodes)` — grava uma conferência e as quantidades esperadas/encontradas de cada item.

## Gravação de conferências

Ao usar **Finalizar e salvar** na tela de conferência, é criada uma linha em `CONFERÊNCIAS` e uma linha por item do kit em `CONFERENCIA_PEÇAS`. O campo `Resultado` é `CONFERIDO` quando todas as quantidades lidas correspondem ao esperado; caso contrário é `DIVERGÊNCIA`. Os campos `Esperada` e `Encontrada` armazenam quantidades.

## Leitura por câmera no iPhone

O HTML Service do Apps Script é executado em um iframe de segurança, ambiente que pode bloquear a permissão de câmera. Por isso, a página independente em `camera-scanner/index.html` deve ser publicada em um host HTTPS, como GitHub Pages. Ela só lê o código pela câmera e o devolve à página principal; não recebe o ID da planilha nem acessa o Google Sheets diretamente.
