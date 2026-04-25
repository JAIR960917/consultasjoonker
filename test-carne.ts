import { JSDOM } from 'jsdom';
import { Canvas, Image } from 'canvas';
import * as fs from 'fs';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).HTMLCanvasElement = Canvas;
(globalThis as any).Image = Image;
(globalThis as any).navigator = dom.window.navigator;

const origCreate = document.createElement.bind(document);
(document as any).createElement = (tag: string) => {
  if (tag === 'canvas') return new Canvas(300, 80) as any;
  return origCreate(tag);
};

// Load logo as data URL
const logoBuf = fs.readFileSync('/dev-server/src/assets/cora-logo.jpg');
const logoDataUrl = `data:image/jpeg;base64,${logoBuf.toString('base64')}`;
(globalThis as any).fetch = async (_: string) => ({
  blob: async () => ({ arrayBuffer: async () => logoBuf.buffer }),
});
// Patch FileReader
class FakeFileReader {
  result: string = '';
  onload: any;
  onerror: any;
  readAsDataURL(_: any) {
    this.result = logoDataUrl;
    setTimeout(() => this.onload?.(), 0);
  }
}
(globalThis as any).FileReader = FakeFileReader;

// Stub the logo import
const Module = await import('module');
// @ts-ignore
const orig = Module.default._resolveFilename;

const { buildCarnePdf } = await import('/dev-server/src/lib/carne.ts');

const pdf = await buildCarnePdf({
  empresa: { nome: 'Oticas Joonker Soledade Ltda', cnpj: '65345269000155' },
  pagador: { nome: 'Jair Azevedo Da Silva Filho', cpf: '12403664421' },
  descricao: 'Oculos',
  parcelas: [
    { numero_parcela: 1, total_parcelas: 3, valor: 500, vencimento: '2026-05-22',
      linha_digitavel: '40390000076534526901681904263019614540000050000',
      codigo_barras: null,
      pix_emv: '00020101021226810014br.gov.bcb.pix2559qrcode.cora.com.br/v1/cobv/test5204000053039865802BR5925OTICAS JOONKER6005CAICO63044176',
      cora_invoice_id: 'inv_test1', nosso_numero: '653452690181904263', numero_documento: '181904263' },
    { numero_parcela: 2, total_parcelas: 3, valor: 500, vencimento: '2026-06-21',
      linha_digitavel: '40390000076534526901681904267010514840000050000',
      codigo_barras: null,
      pix_emv: '00020101021226810014br.gov.bcb.pix2559qrcode.cora.com.br/v1/cobv/test25204000053039865802BR5925OTICAS JOONKER6005CAICO630428C8',
      cora_invoice_id: 'inv_test2', nosso_numero: '653452690181904267', numero_documento: '181904267' },
    { numero_parcela: 3, total_parcelas: 3, valor: 500, vencimento: '2026-07-21',
      linha_digitavel: '40390000076534526901681904271012014440000050000',
      codigo_barras: null,
      pix_emv: '00020101021226810014br.gov.bcb.pix2559qrcode.cora.com.br/v1/cobv/test35204000053039865802BR5925OTICAS JOONKER6005CAICO630415C9',
      cora_invoice_id: 'inv_test3', nosso_numero: '653452690181904271', numero_documento: '181904271' },
  ],
});

const buf = Buffer.from(pdf.output('arraybuffer'));
fs.writeFileSync('/tmp/carne-test.pdf', buf);
console.log('PDF generated:', buf.length, 'bytes');
