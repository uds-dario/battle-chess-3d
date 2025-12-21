import { Chess } from 'chess.js'

export type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k'
export type Color = 'w' | 'b'

export type BoardPiece = {
  type: PieceType
  color: Color
}

export type BoardSquare = BoardPiece | null
export type Board = BoardSquare[][]

export type MoveResult = {
  success: boolean
  illegal: boolean
  captured?: PieceType
  check: boolean
  checkmate: boolean
  san?: string
  fen: string
}

export class ChessEngine {
  private chess = new Chess()

  reset() {
    this.chess.reset()
  }

  getFen() {
    return this.chess.fen()
  }

  getBoard(): Board {
    return this.chess.board().map((row) =>
      row.map((piece) =>
        piece
          ? {
              type: piece.type as PieceType,
              color: piece.color as Color,
            }
          : null
      )
    )
  }

  getLegalMoves(square: string): string[] {
    return this.chess
      .moves({ square, verbose: true })
      .map((move) => move.to)
  }

  move(from: string, to: string): MoveResult {
    const piece = this.chess.get(from)
    const isPawn =
      piece?.type === 'p' &&
      ((piece.color === 'w' && to[1] === '8') ||
        (piece.color === 'b' && to[1] === '1'))

    const move = this.chess.move({
      from,
      to,
      promotion: isPawn ? 'q' : undefined,
    })

    if (!move) {
      return {
        success: false,
        illegal: true,
        check: this.chess.isCheck(),
        checkmate: this.chess.isCheckmate(),
        fen: this.chess.fen(),
      }
    }

    return {
      success: true,
      illegal: false,
      captured: move.captured as PieceType | undefined,
      check: this.chess.isCheck(),
      checkmate: this.chess.isCheckmate(),
      san: move.san,
      fen: this.chess.fen(),
    }
  }

  getTurn(): Color {
    return this.chess.turn() as Color
  }

  isGameOver() {
    return this.chess.isGameOver()
  }
}

export const chessEngine = new ChessEngine()
